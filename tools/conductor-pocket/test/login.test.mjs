import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  presentSidecarLogin,
  requestSidecarLogin,
  sidecarUpArguments,
  startLoginRequest,
  stopLoginRequest,
} from '../scripts/lib/login.mjs';

class FakeChild extends EventEmitter {
  constructor(onKill = () => {}) {
    super();
    this.stdout = { resume() {} };
    this.stderr = { resume() {} };
    this.signals = [];
    this.onKill = onKill;
  }

  kill(signal) {
    this.signals.push(signal);
    this.onKill(signal, this);
    return true;
  }
}

function pendingStatus() {
  return {
    BackendState: 'NeedsLogin',
    AuthURL: 'https://login.tailscale.com/a/abcdef123456',
    Version: '1.98.9',
  };
}

test('login helper is socket-scoped and has its own hard CLI timeout', () => {
  const argumentsList = sidecarUpArguments({ json: true });
  assert.match(argumentsList[0], /^--socket=\//);
  assert.deepEqual(argumentsList.slice(1, 4), [
    'up',
    '--json',
    '--timeout=25s',
  ]);
});

test('login helper cleanup stops at SIGTERM when the child exits', async () => {
  const child = new FakeChild((_signal, target) => {
    queueMicrotask(() => target.emit('exit', null, 'SIGTERM'));
  });
  const request = startLoginRequest('/tailscale', {
    spawnProcess: () => child,
  });
  const result = await stopLoginRequest(request, {
    terminateTimeoutMs: 20,
    killTimeoutMs: 20,
  });
  assert.deepEqual(child.signals, ['SIGTERM']);
  assert.equal(result.signal, 'SIGTERM');
});

test('login helper cleanup escalates to SIGKILL but remains bounded', async () => {
  const child = new FakeChild((signal, target) => {
    if (signal === 'SIGKILL') {
      queueMicrotask(() => target.emit('exit', null, 'SIGKILL'));
    }
  });
  const request = startLoginRequest('/tailscale', {
    spawnProcess: () => child,
  });
  const result = await stopLoginRequest(request, {
    terminateTimeoutMs: 5,
    killTimeoutMs: 20,
  });
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.signal, 'SIGKILL');

  const stuckChild = new FakeChild();
  const stuckRequest = startLoginRequest('/tailscale', {
    spawnProcess: () => stuckChild,
  });
  await assert.rejects(
    stopLoginRequest(stuckRequest, {
      terminateTimeoutMs: 5,
      killTimeoutMs: 5,
    }),
    /did not exit after SIGTERM and SIGKILL/,
  );
});

test('login request proves the daemon retained the URL after helper exit', async () => {
  const child = new FakeChild((_signal, target) => {
    queueMicrotask(() => target.emit('exit', null, 'SIGTERM'));
  });
  const outcome = await requestSidecarLogin('/tailscale', {
    spawnProcess: () => child,
    readStatus: async () => pendingStatus(),
    loginDeadlineMs: 50,
    statusTimeoutMs: 10,
    terminateTimeoutMs: 10,
    killTimeoutMs: 10,
    finalDeadlineMs: 20,
    finalStatusTimeoutMs: 10,
  });
  assert.equal(
    outcome.authUrl,
    'https://login.tailscale.com/a/abcdef123456',
  );
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('login request reports an early spawn error without waiting for the full poll', async () => {
  const child = new FakeChild();
  const startedAt = Date.now();
  queueMicrotask(() => child.emit('error', new Error('spawn failed')));
  await assert.rejects(
    requestSidecarLogin('/tailscale', {
      spawnProcess: () => child,
      readStatus: async () => ({ BackendState: 'NeedsLogin', AuthURL: '' }),
      loginDeadlineMs: 5_000,
      statusTimeoutMs: 10,
      terminateTimeoutMs: 5,
      killTimeoutMs: 5,
      finalDeadlineMs: 10,
      finalStatusTimeoutMs: 5,
    }),
    /could not start/,
  );
  assert.ok(Date.now() - startedAt < 500);
});

test('browser approval opens only a validated URL and printing is explicit', async () => {
  const opened = [];
  let output = '';
  await presentSidecarLogin(
    { status: pendingStatus(), authUrl: pendingStatus().AuthURL },
    {
      openBrowser: async (url) => opened.push(url),
      write: (value) => {
        output += value;
      },
    },
  );
  assert.deepEqual(opened, [pendingStatus().AuthURL]);
  assert.doesNotMatch(output, /abcdef123456/);

  output = '';
  await presentSidecarLogin(
    { status: pendingStatus(), authUrl: pendingStatus().AuthURL },
    {
      printUrl: true,
      openBrowser: async () => {
        throw new Error('must not open');
      },
      write: (value) => {
        output += value;
      },
    },
  );
  assert.match(output, /abcdef123456/);

  await assert.rejects(
    presentSidecarLogin(
      {
        status: { BackendState: 'NeedsLogin' },
        authUrl: 'https://login.tailscale.com.evil.example/a/abcdef',
      },
      {
        openBrowser: async () => {
          throw new Error('must not open');
        },
      },
    ),
    /untrusted login URL/,
  );
});
