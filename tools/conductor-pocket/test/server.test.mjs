import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import { brotliDecompressSync } from 'node:zlib';
import { createConfig } from '../src/config.mjs';
import {
  SESSION_COOKIE,
  SHELL_REVISION,
} from '../src/constants.mjs';
import { sha256 } from '../src/encoding.mjs';
import { HttpError } from '../src/errors.mjs';
import {
  createPocketServer,
  reconcileExactUserMessage,
  waitForExactUserMessage,
} from '../src/server.mjs';

function createWatcher() {
  return {
    subscribe() {
      return () => {};
    },
    stop() {},
  };
}

function createServer(config, { database = {} } = {}) {
  return createPocketServer({
    configStore: { value: config },
    security: {
      bootstrap() {
        return { authenticated: true, unlocked: false };
      },
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database,
    watcher: createWatcher(),
    transport: {
      async doctor() {
        return { ok: true, code: 'ready' };
      },
    },
  });
}

test('large API responses use Brotli when the phone accepts it', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const workspaces = Array.from({ length: 80 }, (_, index) => ({
    id: `workspace-${index}`,
    name: `Workspace ${index} with enough repeated metadata to compress`,
    branch: `feature/fast-pocket-${index}`,
  }));
  const server = createServer(config, {
    database: {
      listWorkspaces() {
        return workspaces;
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await get(port, {
    pathname: '/api/workspaces',
    headers: { 'Accept-Encoding': 'gzip, br' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], 'br');
  assert.equal(response.headers.vary, 'Accept-Encoding');
  assert.deepEqual(
    JSON.parse(
      brotliDecompressSync(response.rawBody).toString('utf8'),
    ),
    { workspaces },
  );
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function get(
  port,
  {
    pathname = '/',
    host = '127.0.0.1:4317',
    method = 'GET',
    headers = {},
  } = {},
) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: { Host: host, ...headers },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks);
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: rawBody.toString('utf8'),
            rawBody,
          });
        });
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function postJson(
  port,
  pathname,
  payload,
  { host = '127.0.0.1:4317', headers = {} } = {},
) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: {
          Host: host,
          Origin: `http://${host}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

function postMessage(
  port,
  {
    idempotencyKey,
    message = 'Test message',
    replaceDraft,
    expectedMacDraft,
  },
) {
  const payload = { message };
  if (typeof replaceDraft === 'boolean') payload.replaceDraft = replaceDraft;
  if (typeof expectedMacDraft === 'string') {
    payload.expectedMacDraft = expectedMacDraft;
  }
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/sessions/test-session/messages',
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4317',
          Origin: 'http://127.0.0.1:4317',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Idempotency-Key': idempotencyKey,
          'X-CSRF-Token': 'test-csrf',
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(body);
  });
}

function composerRetryResult(
  draft,
  inputCounters = Array.from(
    { length: 16 },
    (_, index) => index,
  ).join(','),
) {
  return {
    ok: false,
    code: 'composer_changed_pre_send',
    safeToRetry: true,
    retryCertificate: Buffer.from(
      JSON.stringify({
        draftBase64: Buffer.from(draft, 'utf8').toString('base64'),
        inputCounters,
      }),
      'utf8',
    ).toString('base64'),
  };
}

function postDeliveryStatus(
  port,
  {
    idempotencyKey,
    sessionId = 'test-session',
    deviceId = 'test-device',
  },
) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/api/sessions/${encodeURIComponent(sessionId)}/delivery-status`,
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4317',
          Origin: 'http://127.0.0.1:4317',
          'Idempotency-Key': idempotencyKey,
          'X-CSRF-Token': 'test-csrf',
          'X-Test-Device': deviceId,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('static shell is hardened, host-checked, and development HTTP is not upgraded', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const server = createServer(config);
  const port = await listen(server);
  context.after(() => close(server));

  const page = await get(port);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  assert.doesNotMatch(
    page.headers['content-security-policy'],
    /upgrade-insecure-requests/,
  );
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.match(page.headers['permissions-policy'], /microphone=\(\)/);
  assert.match(page.body, /id="app"/);

  const head = await get(port, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(head.body, '');

  const denied = await get(port, { host: 'attacker.invalid' });
  assert.equal(denied.status, 403);
  assert.deepEqual(JSON.parse(denied.body), {
    error: { code: 'host_denied' },
  });

  const health = await get(port, { pathname: '/api/health' });
  assert.equal(health.status, 200);
  assert.equal(health.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(JSON.parse(health.body).shellRevision, SHELL_REVISION);
  assert.match(
    JSON.parse(health.body).configRevision,
    /^[A-Za-z0-9_-]{43}$/,
  );

  const applicationScript = await get(port, { pathname: '/app.js' });
  assert.equal(applicationScript.status, 200);
  assert.equal(applicationScript.headers['cache-control'], 'no-cache');

  const richTextScript = await get(port, { pathname: '/rich-text.js' });
  assert.equal(richTextScript.status, 200);
  assert.equal(
    richTextScript.headers['content-type'],
    'text/javascript; charset=utf-8',
  );
  const transcriptFocusScript = await get(port, {
    pathname: '/transcript-focus.js',
  });
  assert.equal(transcriptFocusScript.status, 200);
  assert.equal(
    transcriptFocusScript.headers['content-type'],
    'text/javascript; charset=utf-8',
  );
  const appUpdateScript = await get(port, { pathname: '/app-update.js' });
  assert.equal(appUpdateScript.status, 200);
  assert.equal(appUpdateScript.headers['cache-control'], 'no-cache');
  assert.equal(
    appUpdateScript.headers['content-type'],
    'text/javascript; charset=utf-8',
  );

  const compressedScript = await get(port, {
    pathname: '/app.js',
    headers: { 'Accept-Encoding': 'gzip, br' },
  });
  assert.equal(compressedScript.status, 200);
  assert.equal(compressedScript.headers['content-encoding'], 'br');
  assert.equal(compressedScript.headers.vary, 'Accept-Encoding');
  assert.ok(
    compressedScript.rawBody.length <
      Buffer.byteLength(applicationScript.body),
  );
  assert.equal(
    brotliDecompressSync(compressedScript.rawBody).toString('utf8'),
    applicationScript.body,
  );

  const disabledCompression = await get(port, {
    pathname: '/app.js',
    headers: { 'Accept-Encoding': 'br;q=0' },
  });
  assert.equal(disabledCompression.headers['content-encoding'], undefined);
  assert.match(
    await fs.readFile(
      new URL('../src/server.mjs', import.meta.url),
      'utf8',
    ),
    /try \{[\s\S]*brotli = await brotliCompressAsync[\s\S]*\} catch \{[\s\S]*Compression is optional/,
  );
});

test('production shell emits HTTPS upgrade and HSTS', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'https://mac.example-tailnet.ts.net',
  });
  const server = createServer(config);
  const port = await listen(server);
  context.after(() => close(server));

  const page = await get(port, { host: config.rpId });
  assert.equal(page.status, 200);
  assert.match(
    page.headers['content-security-policy'],
    /upgrade-insecure-requests/,
  );
  assert.match(page.headers['strict-transport-security'], /max-age=31536000/);
});

test('auth endpoints preserve explicit lock intent and refreshed secure cookies', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const lockCalls = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      async lock(_request, options) {
        lockCalls.push(options);
        return { locked: options.explicit };
      },
      async verifyAuthentication() {
        return {
          unlocked: true,
          csrfToken: 'refreshed-csrf',
          setCookie:
            `${SESSION_COOKIE}=opaque; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
        };
      },
    },
    database: {},
    watcher: createWatcher(),
    transport: {},
  });
  const port = await listen(server);
  context.after(() => close(server));

  const explicit = await postJson(
    port,
    '/api/auth/lock',
    { explicit: true },
  );
  const legacy = await postJson(port, '/api/auth/lock', {});
  const verified = await postJson(
    port,
    '/api/auth/verify',
    { response: { id: 'credential' } },
  );

  assert.equal(explicit.status, 200);
  assert.equal(legacy.status, 200);
  assert.deepEqual(lockCalls, [
    { explicit: true },
    { explicit: false },
  ]);
  assert.equal(verified.status, 200);
  assert.equal(
    verified.headers['set-cookie'][0],
    `${SESSION_COOKIE}=opaque; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`,
  );
  assert.deepEqual(JSON.parse(verified.body), {
    unlocked: true,
    csrfToken: 'refreshed-csrf',
  });
});

test('a freshly rejected event stream emits a lock event for cached clients', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      session() {
        throw new HttpError(423, 'device_locked');
      },
    },
    database: {},
    watcher: createWatcher(),
    transport: {},
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await get(port, { pathname: '/api/events' });
  assert.equal(response.status, 200);
  assert.match(
    response.headers['content-type'],
    /text\/event-stream/,
  );
  assert.equal(response.headers.connection, 'close');
  assert.equal(
    response.body,
    'event: locked\ndata: {"code":"device_locked"}\n\n',
  );
});

test('connection probe reports the real relay version', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const server = createServer(config);
  const port = await listen(server);
  context.after(() => close(server));

  const response = await get(port, { pathname: '/api/connection' });
  assert.equal(response.status, 200);
  const connection = JSON.parse(response.body);
  assert.equal(connection.relayVersion, '0.2.0');
  assert.equal(connection.conductor, true);
  assert.equal(connection.sendPath, true);
});

test('a send rechecks the durable lock immediately before touching Conductor', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let sessionChecks = 0;
  let sends = 0;
  let cursorReads = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        sessionChecks += 1;
        if (sessionChecks > 1) {
          throw new HttpError(423, 'device_locked');
        }
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        cursorReads += 1;
        return 0;
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return { ok: true, code: 'sent' };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await postMessage(port, {
    idempotencyKey: 'lock_boundary_recheck_key',
  });
  assert.equal(response.status, 423);
  assert.deepEqual(JSON.parse(response.body), {
    error: {
      code: 'device_locked',
      definitelyUnsent: true,
    },
  });
  assert.equal(sessionChecks, 2);
  assert.equal(cursorReads, 0);
  assert.equal(sends, 0);
});

test('a pre-send failure can retry without weakening ambiguous-send idempotency', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let retryableSends = 0;
  let ambiguousSends = 0;
  let mappedPermissionFailures = 0;
  let rejectedSends = 0;
  const acceptedRows = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return acceptedRows.at(-1)?.rowId || 0;
      },
      listUserMessagesAfter(_sessionId, afterRowId) {
        return acceptedRows.filter((row) => row.rowId > afterRowId);
      },
    },
    watcher: createWatcher(),
    transport: {
      async send({ message }) {
        if (message === 'Mapped permission failure') {
          mappedPermissionFailures += 1;
          return mappedPermissionFailures === 1
            ? { ok: false, code: 'accessibility_disabled' }
            : { ok: true, code: 'sent' };
        }
        if (message === 'Rejected send') {
          rejectedSends += 1;
          throw new Error('transport failed');
        }
        if (message === 'Ambiguous send') {
          ambiguousSends += 1;
          return ambiguousSends === 1
            ? { ok: false, code: 'send_not_confirmed' }
            : { ok: true, code: 'sent' };
        }
        retryableSends += 1;
        if (retryableSends === 1) {
          return {
            ok: false,
            code: 'accessibility_disabled',
            safeToRetry: true,
          };
        }
        const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
        acceptedRows.push({
          id: `accepted-${acceptedRows.length + 1}`,
          rowId: acceptedRows.length + 1,
          text: message,
          createdAt: new Date(pressedAt + 100).toISOString(),
          sentAt: new Date(pressedAt + 150).toISOString(),
        });
        return {
          ok: true,
          code: 'sent',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'retryable_failure_key',
  });
  const retry = await postMessage(port, {
    idempotencyKey: 'retryable_failure_key',
  });

  assert.equal(first.status, 503);
  assert.equal(retry.status, 200);
  assert.equal(retryableSends, 2);
  assert.equal(JSON.parse(first.body).error.retrySafe, true);

  const mappedPermissionFailure = await postMessage(port, {
    idempotencyKey: 'mapped_permission_failure_key',
    message: 'Mapped permission failure',
  });
  const mappedPermissionRetry = await postMessage(port, {
    idempotencyKey: 'mapped_permission_failure_key',
    message: 'Mapped permission failure',
  });

  assert.equal(mappedPermissionFailure.status, 503);
  assert.equal(mappedPermissionRetry.status, 503);
  assert.equal(mappedPermissionFailures, 1);
  assert.equal(
    JSON.parse(mappedPermissionFailure.body).error.retrySafe,
    false,
  );

  const ambiguous = await postMessage(port, {
    idempotencyKey: 'ambiguous_failure_key',
    message: 'Ambiguous send',
  });
  const ambiguousRetry = await postMessage(port, {
    idempotencyKey: 'ambiguous_failure_key',
    message: 'Ambiguous send',
  });

  assert.equal(ambiguous.status, 502);
  assert.equal(ambiguousRetry.status, 502);
  assert.equal(ambiguousSends, 1);
  assert.equal(JSON.parse(ambiguous.body).error.retrySafe, false);

  const rejected = await postMessage(port, {
    idempotencyKey: 'rejected_send_key',
    message: 'Rejected send',
  });
  const rejectedRetry = await postMessage(port, {
    idempotencyKey: 'rejected_send_key',
    message: 'Rejected send',
  });

  assert.equal(rejected.status, 500);
  assert.equal(rejectedRetry.status, 500);
  assert.equal(rejectedSends, 1);
});

test('a certified composer rerender retries once inside the same send', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const message = 'Pocket certified retry';
  const retryDraft = 'Pocket cert';
  const inputCounters = Array.from(
    { length: 16 },
    (_, index) => index + 10,
  ).join(',');
  const rows = [];
  const calls = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return rows.at(-1)?.rowId || 40;
      },
      listUserMessagesAfter(_sessionId, afterRowId) {
        return rows.filter((row) => row.rowId > afterRowId);
      },
    },
    watcher: createWatcher(),
    transport: {
      async send(options) {
        calls.push(options);
        if (calls.length === 1) {
          return composerRetryResult(retryDraft, inputCounters);
        }
        const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
        rows.push({
          id: 'retried-user-row',
          rowId: 41,
          text: message,
          createdAt: new Date(pressedAt + 100).toISOString(),
          sentAt: new Date(pressedAt + 150).toISOString(),
        });
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'certified_composer_retry_key',
    message,
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'certified_composer_retry_key',
    message,
  });

  assert.equal(first.status, 200);
  assert.equal(repeated.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].replaceDraft, true);
  assert.equal(calls[1].expectedMacDraft, retryDraft);
  assert.equal(calls[1].expectedInputCounters, inputCounters);
  assert.ok(calls[1].timeoutMs >= 1_000);
  assert.ok(calls[1].timeoutMs <= 45_000);
});

test('a certified composer retry is bounded once and restores the phone draft', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 50;
      },
      listUserMessagesAfter() {
        return [];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return composerRetryResult('Test');
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await postMessage(port, {
    idempotencyKey: 'bounded_composer_retry_key',
  });

  assert.equal(response.status, 502);
  assert.equal(sends, 2);
  assert.deepEqual(JSON.parse(response.body).error, {
    code: 'composer_changed_pre_send',
    retrySafe: true,
    definitelyUnsent: true,
  });
});

test('a new user row blocks a certified composer retry', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let firstAttemptFinished = false;
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 60;
      },
      listUserMessagesAfter() {
        return firstAttemptFinished
          ? [
              {
                id: 'manual-user-row',
                rowId: 61,
                text: 'Manual message',
                createdAt: new Date().toISOString(),
              },
            ]
          : [];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        firstAttemptFinished = true;
        return composerRetryResult('Test');
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await postMessage(port, {
    idempotencyKey: 'blocked_composer_retry_key',
  });

  assert.equal(response.status, 409);
  assert.equal(sends, 1);
  assert.deepEqual(JSON.parse(response.body).error, {
    code: 'user_input_active',
    retrySafe: true,
    definitelyUnsent: true,
  });
});

test('an idempotency key remains bound to the exact send body across safe retries', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 0;
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'composer_unavailable',
          safeToRetry: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'body_bound_retry_key',
    message: 'Original message',
  });
  const changedMessage = await postMessage(port, {
    idempotencyKey: 'body_bound_retry_key',
    message: 'Changed message',
  });
  const changedReplacement = await postMessage(port, {
    idempotencyKey: 'body_bound_retry_key',
    message: 'Original message',
    replaceDraft: true,
    expectedMacDraft: 'Owned draft',
  });
  const exactRetry = await postMessage(port, {
    idempotencyKey: 'body_bound_retry_key',
    message: 'Original message',
  });

  assert.equal(first.status, 503);
  assert.equal(changedMessage.status, 409);
  assert.equal(changedReplacement.status, 409);
  assert.deepEqual(JSON.parse(changedMessage.body).error, {
    code: 'idempotency_key_reused',
    definitelyUnsent: true,
  });
  assert.equal(exactRetry.status, 503);
  assert.equal(sends, 2);
});

test('an ambiguous UI result is confirmed by the exact new Conductor row', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let sends = 0;
  const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
  const observed = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session(request) {
        return {
          device: {
            id: request.headers['x-test-device'] || 'test-device',
          },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute(sessionId) {
        return {
          id: sessionId,
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor(sessionId) {
        observed.push(['cursor', sessionId]);
        return 41;
      },
      listUserMessagesAfter(sessionId, afterRowId) {
        const exactContent = 'Line one\nLine two';
        observed.push(['match', sessionId, afterRowId, exactContent]);
        return [
          {
            id: 'user-row-42',
            rowId: 42,
            kind: 'user',
            text: exactContent,
            createdAt: new Date(pressedAt + 100).toISOString(),
            sentAt: null,
            cancelledAt: null,
            queued: true,
          },
        ];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send({ message }) {
        sends += 1;
        observed.push(['send', message]);
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const sent = await postMessage(port, {
    idempotencyKey: 'database_confirmed_key',
    message: 'Line one\r\nLine two',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'database_confirmed_key',
    message: 'Line one\r\nLine two',
  });

  assert.equal(sent.status, 200);
  assert.equal(repeated.status, 200);
  assert.equal(sends, 1);
  const receipt = JSON.parse(sent.body);
  assert.equal(receipt.delivery, 'delivered');
  assert.equal(receipt.confirmation, 'database');
  assert.equal(receipt.baselineCursor, 41);
  assert.equal(receipt.rowId, 42);
  assert.deepEqual(observed.slice(0, 3), [
    ['cursor', 'test-session'],
    ['send', 'Line one\nLine two'],
    ['match', 'test-session', 41, 'Line one\nLine two'],
  ]);

  const status = await postDeliveryStatus(port, {
    idempotencyKey: 'database_confirmed_key',
  });
  assert.equal(status.status, 200);
  assert.deepEqual(JSON.parse(status.body).delivery, {
    state: 'delivered',
    deliveredAt: receipt.deliveredAt,
    baselineCursor: 41,
    messageId: 'user-row-42',
    rowId: 42,
  });
  assert.equal(status.body.includes('Line one'), false);

  const wrongSession = await postDeliveryStatus(port, {
    idempotencyKey: 'database_confirmed_key',
    sessionId: 'other-session',
  });
  const wrongDevice = await postDeliveryStatus(port, {
    idempotencyKey: 'database_confirmed_key',
    deviceId: 'other-device',
  });
  assert.deepEqual(JSON.parse(wrongSession.body).delivery, {
    state: 'unknown',
  });
  assert.deepEqual(JSON.parse(wrongDevice.body).delivery, {
    state: 'unknown',
  });
});

test('send canonicalizes outer whitespace before transport, confirmation, and idempotency', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const canonical = 'Pocket dictated\nline two';
  const rows = [];
  const transported = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return rows.at(-1)?.rowId || 0;
      },
      listUserMessagesAfter(_sessionId, afterRowId) {
        return rows.filter((row) => row.rowId > afterRowId);
      },
    },
    watcher: createWatcher(),
    transport: {
      async send({ message }) {
        transported.push(message);
        const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
        rows.push({
          id: 'trimmed-user-row',
          rowId: 1,
          text: canonical,
          createdAt: new Date(pressedAt + 100).toISOString(),
          sentAt: new Date(pressedAt + 150).toISOString(),
        });
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'trimmed_dictation_key',
    message: '  Pocket dictated\r\nline two \n',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'trimmed_dictation_key',
    message: canonical,
  });

  assert.equal(first.status, 200);
  assert.equal(repeated.status, 200);
  assert.deepEqual(transported, [canonical]);
});

test('delivery status recovers a late exact row without resending or exposing content', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const message = 'Late exact Pocket message';
  const pressedAt = Date.now() - 5_000;
  const exactRow = {
    id: 'late-user-row',
    rowId: 52,
    text: message,
    createdAt: new Date(pressedAt + 4_000).toISOString(),
    sentAt: new Date(pressedAt + 4_100).toISOString(),
  };
  let sends = 0;
  let databaseReads = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session(request) {
        return {
          device: {
            id: request.headers['x-test-device'] || 'test-device',
          },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute(sessionId) {
        return {
          id: sessionId,
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 51;
      },
      listUserMessagesAfter() {
        databaseReads += 1;
        return [exactRow];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'late_database_confirmation_key',
    message,
  });
  assert.equal(first.status, 502);
  assert.equal(first.body.includes(message), false);
  assert.equal(first.body.includes('contentHash'), false);

  const readsBeforeWrongScope = databaseReads;
  const wrongSession = await postDeliveryStatus(port, {
    idempotencyKey: 'late_database_confirmation_key',
    sessionId: 'other-session',
  });
  const wrongDevice = await postDeliveryStatus(port, {
    idempotencyKey: 'late_database_confirmation_key',
    deviceId: 'other-device',
  });
  assert.deepEqual(JSON.parse(wrongSession.body).delivery, {
    state: 'unknown',
  });
  assert.deepEqual(JSON.parse(wrongDevice.body).delivery, {
    state: 'unknown',
  });
  assert.equal(databaseReads, readsBeforeWrongScope);

  const readsBeforeRecovery = databaseReads;
  const [status, concurrentStatus] = await Promise.all([
    postDeliveryStatus(port, {
      idempotencyKey: 'late_database_confirmation_key',
    }),
    postDeliveryStatus(port, {
      idempotencyKey: 'late_database_confirmation_key',
    }),
  ]);
  assert.deepEqual(JSON.parse(status.body).delivery, {
    state: 'delivered',
    deliveredAt: exactRow.sentAt,
    baselineCursor: 51,
    messageId: exactRow.id,
    rowId: exactRow.rowId,
  });
  assert.deepEqual(
    JSON.parse(concurrentStatus.body),
    JSON.parse(status.body),
  );
  assert.equal(databaseReads - readsBeforeRecovery, 2);
  assert.equal(status.body.includes(message), false);
  assert.equal(status.body.includes('contentHash'), false);

  const repeated = await postMessage(port, {
    idempotencyKey: 'late_database_confirmation_key',
    message,
  });
  assert.equal(repeated.status, 200);
  assert.equal(JSON.parse(repeated.body).rowId, exactRow.rowId);
  assert.equal(sends, 1);
});

test('delivery status remains pending in-window and recovers the exact row', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const message = 'Pending exact Pocket message';
  const pressedAt = Date.now();
  const rows = [];
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 60;
      },
      listUserMessagesAfter() {
        return rows;
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'pending_database_confirmation_key',
    message,
  });
  const pending = await postDeliveryStatus(port, {
    idempotencyKey: 'pending_database_confirmation_key',
  });

  assert.equal(first.status, 502);
  assert.deepEqual(JSON.parse(pending.body).delivery, {
    state: 'pending',
  });
  assert.equal(pending.body.includes(message), false);
  assert.equal(pending.body.includes('contentHash'), false);

  rows.push({
    id: 'pending-user-row',
    rowId: 61,
    text: message,
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
  });
  const delivered = await postDeliveryStatus(port, {
    idempotencyKey: 'pending_database_confirmation_key',
  });

  assert.equal(delivered.status, 200);
  assert.equal(
    JSON.parse(delivered.body).delivery.state,
    'delivered',
  );
  assert.equal(sends, 1);
});

test('delivery status stays fail-closed for an interfering late row', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const message = 'Expected late Pocket message';
  const pressedAt = Date.now() - 5_000;
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 80;
      },
      listUserMessagesAfter() {
        return [
          {
            id: 'late-exact-row',
            rowId: 81,
            text: message,
            createdAt: new Date(pressedAt + 4_000).toISOString(),
          },
          {
            id: 'interfering-user-row',
            rowId: 82,
            text: 'A different user message',
            createdAt: new Date(pressedAt + 4_100).toISOString(),
          },
        ];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'late_database_interference_key',
    message,
  });
  const status = await postDeliveryStatus(port, {
    idempotencyKey: 'late_database_interference_key',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'late_database_interference_key',
    message,
  });

  assert.equal(first.status, 502);
  assert.equal(repeated.status, 502);
  assert.deepEqual(JSON.parse(status.body).delivery, {
    state: 'failed',
    code: 'send_not_confirmed',
    retrySafe: false,
  });
  assert.equal(status.body.includes(message), false);
  assert.equal(status.body.includes('contentHash'), false);
  assert.equal(sends, 1);
});

test('delivery status rejects an exact row outside the recovery window', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const message = 'Out-of-window Pocket message';
  const pressedAt = Date.now() - 20_000;
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 90;
      },
      listUserMessagesAfter() {
        return [
          {
            id: 'out-of-window-row',
            rowId: 91,
            text: message,
            createdAt: new Date(pressedAt + 15_001).toISOString(),
          },
        ];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'out_of_window_confirmation_key',
    message,
  });
  const status = await postDeliveryStatus(port, {
    idempotencyKey: 'out_of_window_confirmation_key',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'out_of_window_confirmation_key',
    message,
  });

  assert.equal(first.status, 502);
  assert.equal(repeated.status, 502);
  assert.deepEqual(JSON.parse(status.body).delivery, {
    state: 'failed',
    code: 'send_not_confirmed',
    retrySafe: false,
  });
  assert.equal(status.body.includes(message), false);
  assert.equal(status.body.includes('contentHash'), false);
  assert.equal(sends, 1);
});

test('a physical-input interruption is delivered when Conductor has the exact new row', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const interruptedAt = Date.now();
  let sends = 0;
  const exactRow = {
    id: 'user-row-after-interruption',
    rowId: 18,
    kind: 'user',
    text: 'User completed this send',
    createdAt: new Date(interruptedAt + 5_000).toISOString(),
    sentAt: null,
  };
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 17;
      },
      listUserMessagesAfter() {
        return [exactRow];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_interrupted',
          pressedAt: interruptedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await postMessage(port, {
    idempotencyKey: 'input_interruption_confirmed_key',
    message: exactRow.text,
  });

  assert.equal(response.status, 200);
  assert.equal(sends, 1);
  const receipt = JSON.parse(response.body);
  assert.equal(typeof receipt.deliveredAt, 'string');
  assert.deepEqual({ ...receipt, deliveredAt: '<timestamp>' }, {
    delivery: 'delivered',
    deliveredAt: '<timestamp>',
    sessionId: 'test-session',
    confirmation: 'database',
    baselineCursor: 17,
    messageId: exactRow.id,
    rowId: exactRow.rowId,
  });
});

test('an interfering user row makes an interrupted send non-retryable', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const interruptedAt = Date.now();
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 20;
      },
      listUserMessagesAfter() {
        return [
          {
            id: 'manual-row',
            rowId: 21,
            text: 'Different manual message',
            createdAt: new Date(interruptedAt + 100).toISOString(),
          },
        ];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: false,
          code: 'send_interrupted',
          pressedAt: interruptedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'input_interruption_interference_key',
    message: 'Expected Pocket message',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'input_interruption_interference_key',
    message: 'Expected Pocket message',
  });

  assert.equal(first.status, 502);
  assert.equal(repeated.status, 502);
  assert.equal(sends, 1);
  assert.deepEqual(JSON.parse(first.body).error, {
    code: 'send_not_confirmed',
    retrySafe: false,
  });
});

test('an interruption before Pocket owns the full composer fails fast and is retryable', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const interruptedAt = Date.now();
  let queriedAfterInterruption = false;
  const audits = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 24;
      },
      listUserMessagesAfter() {
        queriedAfterInterruption = true;
        return [];
      },
    },
    watcher: createWatcher(),
    audit(event) {
      audits.push(event);
    },
    transport: {
      async send() {
        return {
          ok: false,
          code: 'send_interrupted',
          pressedAt: interruptedAt,
          composerOwned: false,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const startedAt = Date.now();
  const response = await postMessage(port, {
    idempotencyKey: 'known_pre_submit_interruption_key',
  });

  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(response.body).error, {
    code: 'user_input_active',
    retrySafe: true,
    definitelyUnsent: true,
  });
  assert.equal(queriedAfterInterruption, false);
  assert.ok(Date.now() - startedAt < 1_000);
  assert.deepEqual(
    audits.map((event) => event.phase),
    ['accepted', 'transport', 'complete'],
  );
  assert.equal(JSON.stringify(audits).includes('Hello from Pocket'), false);
  assert.deepEqual(
    audits.map((event) => event.code).filter(Boolean),
    ['send_interrupted', 'user_input_active'],
  );
});

test('an interrupted pre-send attempt is retryable only after Conductor stays unchanged', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const interruptedAt = Date.now();
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 25;
      },
      listUserMessagesAfter() {
        return [];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        if (sends === 1) {
          return {
            ok: false,
            code: 'send_interrupted',
            pressedAt: interruptedAt,
            composerOwned: true,
          };
        }
        return {
          ok: false,
          code: 'composer_unavailable',
          safeToRetry: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'input_interruption_retry_key',
  });
  const retry = await postMessage(port, {
    idempotencyKey: 'input_interruption_retry_key',
  });

  assert.equal(first.status, 409);
  assert.deepEqual(JSON.parse(first.body).error, {
    code: 'user_input_active',
    retrySafe: true,
    definitelyUnsent: true,
  });
  assert.equal(retry.status, 503);
  assert.equal(sends, 2);
});

test('a cleared composer without an exact database row is never reported delivered', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
  let sends = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 7;
      },
      listUserMessagesAfter() {
        return [
          {
            id: 'manual-row',
            rowId: 8,
            text: 'Different manual message',
            createdAt: new Date(pressedAt + 100).toISOString(),
            sentAt: null,
          },
        ];
      },
    },
    watcher: createWatcher(),
    transport: {
      async send() {
        sends += 1;
        return {
          ok: true,
          code: 'sent',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = await postMessage(port, {
    idempotencyKey: 'unattributed_success_key',
    message: 'Expected Pocket message',
  });
  const repeated = await postMessage(port, {
    idempotencyKey: 'unattributed_success_key',
    message: 'Expected Pocket message',
  });

  assert.equal(first.status, 502);
  assert.equal(repeated.status, 502);
  assert.equal(sends, 1);
  assert.deepEqual(JSON.parse(first.body).error, {
    code: 'send_not_confirmed',
    retrySafe: false,
  });
});

test('ambiguous-send attribution retries database reads and rejects interference', async () => {
  const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
  const exact = {
    id: 'user-1',
    rowId: 11,
    kind: 'user',
    text: 'Exact',
    createdAt: new Date(pressedAt + 100).toISOString(),
  };
  let reads = 0;
  const recovered = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        reads += 1;
        if (reads === 1) throw new Error('briefly busy');
        return [exact];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 100,
    pollMs: 1,
    recheckMs: 1,
  });
  assert.equal(recovered, exact);
  assert.ok(reads >= 3);

  let gapRead = 0;
  const gapReads = [[exact], [], [exact], [exact]];
  const recoveredAcrossGap = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        const result =
          gapReads[Math.min(gapRead, gapReads.length - 1)];
        gapRead += 1;
        return result;
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 100,
    pollMs: 1,
    recheckMs: 1,
  });
  assert.equal(recoveredAcrossGap, exact);
  assert.equal(gapRead, 4);

  const replacement = {
    ...exact,
    id: 'user-2',
    rowId: 12,
  };
  let replacementRead = 0;
  const replacementReads = [
    [exact],
    [],
    [replacement],
    [replacement],
  ];
  const rejectedReplacement = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        const result =
          replacementReads[
            Math.min(
              replacementRead,
              replacementReads.length - 1,
            )
          ];
        replacementRead += 1;
        return result;
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 100,
    pollMs: 1,
    recheckMs: 1,
  });
  assert.equal(rejectedReplacement, null);
  assert.equal(replacementRead, 3);

  const eventTimestampedJustBeforePress = {
    ...exact,
    createdAt: new Date(pressedAt - 1).toISOString(),
  };
  const recoveredAcrossEventTimestampSkew = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        return [eventTimestampedJustBeforePress];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 0,
    recheckMs: 0,
  });
  assert.equal(
    recoveredAcrossEventTimestampSkew,
    eventTimestampedJustBeforePress,
  );

  const rejectedOutsideEventTimestampSkew = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        return [
          {
            ...exact,
            createdAt: new Date(pressedAt - 251).toISOString(),
          },
        ];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 0,
    recheckMs: 0,
  });
  assert.equal(rejectedOutsideEventTimestampSkew, null);

  const interfered = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        return [
          exact,
          {
            ...exact,
            id: 'manual-user-2',
            rowId: 12,
            text: 'Manual message',
          },
        ];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 10,
    pollMs: 1,
    recheckMs: 1,
  });
  assert.equal(interfered, null);

  let mutableRead = 0;
  const changedOnRecheck = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        mutableRead += 1;
        return [
          mutableRead === 1
            ? exact
            : {
                ...exact,
                text: 'Changed while rechecking',
              },
        ];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: true,
    timeoutMs: 10,
    pollMs: 1,
    recheckMs: 1,
  });
  assert.equal(changedOnRecheck, null);

  let unownedReads = 0;
  const unowned = await waitForExactUserMessage({
    database: {
      listUserMessagesAfter() {
        unownedReads += 1;
        return [exact];
      },
    },
    sessionId: 'session-1',
    afterRowId: 10,
    exactContent: 'Exact',
    pressedAt,
    composerOwned: false,
  });
  assert.equal(unowned, null);
  assert.equal(unownedReads, 0);
});

test('delivery reconciliation handles the post-scan boundary without false failure', async () => {
  const pressedAt = Date.now() - 100;
  const exact = {
    id: 'boundary-user-row',
    rowId: 32,
    text: 'Boundary exact message',
    createdAt: new Date(pressedAt + 50).toISOString(),
    sentAt: new Date(pressedAt + 60).toISOString(),
  };
  let exactReads = 0;
  const delivered = await reconcileExactUserMessage({
    database: {
      listUserMessagesAfter() {
        exactReads += 1;
        return exactReads === 1 ? [] : [exact];
      },
    },
    sessionId: 'session-1',
    afterRowId: 31,
    exactContentHash: sha256(exact.text),
    pressedAt,
    composerOwned: true,
    attributionWindowMs: 15_000,
    timeoutMs: 0,
  });
  assert.equal(delivered.state, 'delivered');
  assert.equal(delivered.match, exact);
  assert.equal(exactReads, 4);

  let interferenceReads = 0;
  const interfered = await reconcileExactUserMessage({
    database: {
      listUserMessagesAfter() {
        interferenceReads += 1;
        return interferenceReads === 1
          ? []
          : [{ ...exact, text: 'Interfering message' }];
      },
    },
    sessionId: 'session-1',
    afterRowId: 31,
    exactContentHash: sha256(exact.text),
    pressedAt,
    composerOwned: true,
    attributionWindowMs: 15_000,
    timeoutMs: 0,
  });
  assert.deepEqual(interfered, { state: 'failed' });

  const expired = await reconcileExactUserMessage({
    database: {
      listUserMessagesAfter() {
        return [];
      },
    },
    sessionId: 'session-1',
    afterRowId: 31,
    exactContentHash: sha256(exact.text),
    pressedAt: Date.now() - 20_000,
    composerOwned: true,
    attributionWindowMs: 15_000,
    timeoutMs: 0,
  });
  assert.deepEqual(expired, { state: 'failed' });
});

test('concurrent identical sends claim distinct post-cursor rows', async (context) => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let cursor = 0;
  const rows = [];
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'test-device' },
          csrfToken: 'test-csrf',
          unlocked: true,
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'test-session',
          workspaceName: 'Workspace',
          title: 'Chat',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return cursor;
      },
      listUserMessagesAfter(_sessionId, afterRowId) {
        return rows.filter(
          (row) => row.rowId > afterRowId,
        );
      },
    },
    watcher: createWatcher(),
    transport: {
      async send({ message }) {
        await Promise.resolve();
        const pressedAt = Math.floor(Date.now() / 1_000) * 1_000;
        cursor += 1;
        rows.push({
          id: `user-${cursor}`,
          rowId: cursor,
          text: message,
          createdAt: new Date(pressedAt + 100).toISOString(),
          sentAt: new Date(pressedAt + 150).toISOString(),
        });
        return {
          ok: false,
          code: 'send_not_confirmed',
          pressedAt,
          composerOwned: true,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const [first, second] = await Promise.all([
    postMessage(port, {
      idempotencyKey: 'concurrent_identical_key_a',
      message: 'Identical',
    }),
    postMessage(port, {
      idempotencyKey: 'concurrent_identical_key_b',
      message: 'Identical',
    }),
  ]);
  const receipts = [JSON.parse(first.body), JSON.parse(second.body)].sort(
    (left, right) => left.rowId - right.rowId,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(
    receipts.map((receipt) => [
      receipt.baselineCursor,
      receipt.rowId,
    ]),
    [
      [0, 1],
      [1, 2],
    ],
  );
});

test('service worker handles only Pocket shell paths and Pocket-owned caches', async () => {
  const source = await fs.readFile(
    new URL('../public/service-worker.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /!SHELL_PATHS\.has\(requestUrl\.pathname\)/);
  assert.match(source, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(
    source,
    /key\.startsWith\('conductor-pocket-shell-'\)/,
  );
  assert.match(
    source,
    /matchAll\(\{ type: 'window', includeUncontrolled: true \}\)/,
  );
  assert.match(source, /type: 'shell-activated'/);
  assert.doesNotMatch(source, /client\.navigate\(/);
  assert.doesNotMatch(source, /setTimeout\(/);
  assert.match(
    source,
    /event\.waitUntil\([\s\S]*self\.clients\.claim\(\)[\s\S]*\)/,
  );
  assert.match(
    source,
    /cache\.addAll\(SHELL\)[\s\S]*self\.skipWaiting\(\)/,
  );
  assert.match(
    source,
    /VERSIONED_SHELL_PATHS\.has\(requestUrl\.pathname\)[\s\S]*caches[\s\S]*\.match\(event\.request\)[\s\S]*response \|\| fetchAndCache\(event\.request\)/,
  );
});

test('Pocket shell asset versions remain consistent across the rollout', async () => {
  const [
    application,
    document,
    serviceWorker,
    constants,
    installer,
    cli,
  ] = await Promise.all([
    fs.readFile(
      new URL('../public/app.js', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../public/index.html', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../public/service-worker.js', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../src/constants.mjs', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../scripts/install-relay.mjs', import.meta.url),
      'utf8',
    ),
    fs.readFile(
      new URL('../src/cli.mjs', import.meta.url),
      'utf8',
    ),
  ]);
  const appVersion = document.match(
    /src="\/app\.js\?v=([^"]+)"/,
  )?.[1];
  const cssVersion = document.match(
    /href="\/app\.css\?v=([^"]+)"/,
  )?.[1];
  const preloadVersion = document.match(
    /rel="modulepreload" href="\/delivery-receipts\.js\?v=([^"]+)"/,
  )?.[1];
  const httpPreloadVersion = document.match(
    /rel="modulepreload" href="\/http\.js\?v=([^"]+)"/,
  )?.[1];
  const imageAttachmentsPreloadVersion = document.match(
    /rel="modulepreload" href="\/image-attachments\.js\?v=([^"]+)"/,
  )?.[1];
  const appUpdatePreloadVersion = document.match(
    /rel="modulepreload" href="\/app-update\.js\?v=([^"]+)"/,
  )?.[1];
  const refreshPreloadVersion = document.match(
    /rel="modulepreload" href="\/live-refresh\.js\?v=([^"]+)"/,
  )?.[1];
  const richTextPreloadVersion = document.match(
    /rel="modulepreload" href="\/rich-text\.js\?v=([^"]+)"/,
  )?.[1];
  const transcriptFocusPreloadVersion = document.match(
    /rel="modulepreload" href="\/transcript-focus\.js\?v=([^"]+)"/,
  )?.[1];
  const swipeNavigationPreloadVersion = document.match(
    /rel="modulepreload" href="\/swipe-navigation\.js\?v=([^"]+)"/,
  )?.[1];
  const cachedAppVersion = serviceWorker.match(
    /'\/app\.js\?v=([^']+)'/,
  )?.[1];
  const cachedCssVersion = serviceWorker.match(
    /'\/app\.css\?v=([^']+)'/,
  )?.[1];
  const receiptsVersion = application.match(
    /from '\.\/delivery-receipts\.js\?v=([^']+)'/,
  )?.[1];
  const cachedReceiptsVersion = serviceWorker.match(
    /'\/delivery-receipts\.js\?v=([^']+)'/,
  )?.[1];
  const httpVersion = application.match(
    /from '\.\/http\.js\?v=([^']+)'/,
  )?.[1];
  const appUpdateVersion = application.match(
    /from '\.\/app-update\.js\?v=([^']+)'/,
  )?.[1];
  const cachedHttpVersion = serviceWorker.match(
    /'\/http\.js\?v=([^']+)'/,
  )?.[1];
  const imageAttachmentsVersion = application.match(
    /from '\.\/image-attachments\.js\?v=([^']+)'/,
  )?.[1];
  const cachedImageAttachmentsVersion = serviceWorker.match(
    /'\/image-attachments\.js\?v=([^']+)'/,
  )?.[1];
  const cachedAppUpdateVersion = serviceWorker.match(
    /'\/app-update\.js\?v=([^']+)'/,
  )?.[1];
  const refreshVersion = application.match(
    /from '\.\/live-refresh\.js\?v=([^']+)'/,
  )?.[1];
  const cachedRefreshVersion = serviceWorker.match(
    /'\/live-refresh\.js\?v=([^']+)'/,
  )?.[1];
  const richTextVersion = application.match(
    /from '\.\/rich-text\.js\?v=([^']+)'/,
  )?.[1];
  const cachedRichTextVersion = serviceWorker.match(
    /'\/rich-text\.js\?v=([^']+)'/,
  )?.[1];
  const transcriptFocusVersion = application.match(
    /from '\.\/transcript-focus\.js\?v=([^']+)'/,
  )?.[1];
  const cachedTranscriptFocusVersion = serviceWorker.match(
    /'\/transcript-focus\.js\?v=([^']+)'/,
  )?.[1];
  const swipeNavigationVersion = application.match(
    /from '\.\/swipe-navigation\.js\?v=([^']+)'/,
  )?.[1];
  const cachedSwipeNavigationVersion = serviceWorker.match(
    /'\/swipe-navigation\.js\?v=([^']+)'/,
  )?.[1];
  const documentRevision = document.match(
    /name="conductor-pocket-shell-revision" content="([^"]+)"/,
  )?.[1];
  const clientRevision = application.match(
    /const CLIENT_SHELL_REVISION = '([^']+)'/,
  )?.[1];
  const workerRevision = serviceWorker.match(
    /const SHELL_REVISION = '([^']+)'/,
  )?.[1];
  const serverRevision = constants.match(
    /export const SHELL_REVISION = '([^']+)'/,
  )?.[1];

  assert.ok(appVersion);
  assert.equal(cssVersion, appVersion);
  assert.equal(preloadVersion, appVersion);
  assert.equal(cachedAppVersion, appVersion);
  assert.equal(cachedCssVersion, appVersion);
  assert.equal(receiptsVersion, appVersion);
  assert.equal(cachedReceiptsVersion, appVersion);
  assert.equal(httpPreloadVersion, appVersion);
  assert.equal(httpVersion, appVersion);
  assert.equal(cachedHttpVersion, appVersion);
  assert.equal(imageAttachmentsPreloadVersion, appVersion);
  assert.equal(imageAttachmentsVersion, appVersion);
  assert.equal(cachedImageAttachmentsVersion, appVersion);
  assert.equal(appUpdatePreloadVersion, appVersion);
  assert.equal(appUpdateVersion, appVersion);
  assert.equal(cachedAppUpdateVersion, appVersion);
  assert.equal(refreshPreloadVersion, appVersion);
  assert.equal(refreshVersion, appVersion);
  assert.equal(cachedRefreshVersion, appVersion);
  assert.equal(richTextPreloadVersion, appVersion);
  assert.equal(richTextVersion, appVersion);
  assert.equal(cachedRichTextVersion, appVersion);
  assert.equal(transcriptFocusPreloadVersion, appVersion);
  assert.equal(transcriptFocusVersion, appVersion);
  assert.equal(cachedTranscriptFocusVersion, appVersion);
  assert.equal(swipeNavigationPreloadVersion, appVersion);
  assert.equal(swipeNavigationVersion, appVersion);
  assert.equal(cachedSwipeNavigationVersion, appVersion);
  assert.equal(documentRevision, appVersion);
  assert.equal(clientRevision, appVersion);
  assert.equal(workerRevision, appVersion);
  assert.equal(serverRevision, appVersion);
  assert.match(
    installer,
    /expectedShellRevision = SHELL_REVISION[\s\S]*body\.shellRevision === expectedShellRevision/,
  );
  assert.match(
    cli,
    /expectedShellRevision = SHELL_REVISION[\s\S]*body\.shellRevision === expectedShellRevision/,
  );
});

test('Pocket applies app updates only when foreground state is safe', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  const predicateStart = source.indexOf(
    'function currentAppUpdateReloadIsSafe()',
  );
  const predicateEnd = source.indexOf(
    "document.addEventListener('visibilitychange'",
    predicateStart,
  );
  const predicate = source.slice(predicateStart, predicateEnd);

  assert.ok(predicateStart >= 0);
  assert.ok(predicateEnd > predicateStart);
  assert.match(predicate, /originRetired/);
  assert.match(predicate, /ORIGIN_RETIRED_KEY/);
  assert.match(predicate, /sensitiveOperations: appUpdateSensitiveOperations/);
  assert.doesNotMatch(predicate, /!state\.shell/);
  assert.match(predicate, /location\.hash/);
  assert.match(predicate, /overlayOpen: overlayRoot\.childElementCount > 0/);
  assert.match(predicate, /composerValue/);
  assert.match(predicate, /persistedComposerValue/);
  assert.match(predicate, /deliveries: state\.optimistic/);
  assert.match(
    predicate,
    /attachmentCount: unsafeAttachmentOperationCount\(\)/,
  );
  assert.match(
    source,
    /createServiceWorkerRegistrationGetter\(\{[\s\S]*serviceWorker: navigator\.serviceWorker/,
  );
  assert.match(
    source,
    /navigator\.credentials\.create[\s\S]*runWithAppUpdatePaused|runWithAppUpdatePaused[\s\S]*navigator\.credentials\.create/,
  );
  assert.match(
    source,
    /navigator\.credentials\.get[\s\S]*runWithAppUpdatePaused|runWithAppUpdatePaused[\s\S]*navigator\.credentials\.get/,
  );
  assert.match(
    source,
    /function gateView[\s\S]*appUpdateCoordinator\?\.stateChanged\(\)/,
  );
  assert.match(
    source,
    /async function purgeLocalData\(\)[\s\S]*appUpdateCoordinator\?\.stop\(\)/,
  );
  assert.match(
    source,
    /visibilitychange[\s\S]*appUpdateCoordinator\?\.foreground\(\)/,
  );
  assert.match(
    source,
    /eventSource\.addEventListener\('ready'[\s\S]*serverRevision[\s\S]*checkForUpdate\(\{ force: true \}\)/,
  );
  assert.match(source, /getServerRevision:[\s\S]*\/api\/health/);
  assert.match(source, /reload: reloadForShellRevision/);
  assert.match(
    source,
    /setInterval\([\s\S]*appUpdateCoordinator\.checkForUpdate\(\)[\s\S]*APP_UPDATE_CHECK_INTERVAL_MS/,
  );
});

test('assistant messages preserve rich semantics and speaker context', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  const assistantStart = source.indexOf(
    "if (message.kind === 'assistant')",
  );
  const userStart = source.indexOf(
    "if (message.kind === 'user'",
    assistantStart,
  );
  const assistantRenderer = source.slice(assistantStart, userStart);

  assert.ok(assistantStart >= 0);
  assert.ok(userStart > assistantStart);
  assert.match(assistantRenderer, /className: 'sr-only'/);
  assert.match(
    assistantRenderer,
    /'Conductor progress:'[\s\S]*'Conductor replied:'/,
  );
  assert.match(
    assistantRenderer,
    /addCodeCopyControls\([\s\S]*renderRichText\(document, message\.text\)/,
  );
  assert.doesNotMatch(assistantRenderer, /aria-label/);
});

test('remembered Tailnet access keeps the privacy shield without background auto-lock', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /state\.auth\.reauthenticationMode === TAILSCALE_SESSION_MODE/,
  );
  assert.match(source, /if \(awayTooLong && !trustedSession\)/);
  assert.match(
    source,
    /request\('\/api\/auth\/lock'[\s\S]*body: \{ explicit: true \}/,
  );
  assert.match(source, /id: 'privacy-shield'/);
  assert.match(source, /shieldApplication\(\)/);
  assert.match(source, /stopEvents\(\)/);
  assert.match(source, /state\.visibilityEpoch \+= 1/);
  assert.match(
    source,
    /document\.hidden \|\|[\s\S]*revealEpoch !== state\.visibilityEpoch/,
  );
  assert.match(
    source,
    /code === 'device_session_expired'[\s\S]*purgeThenRenderSignedOut/,
  );
  assert.match(
    source,
    /code === 'device_identity_mismatch'[\s\S]*renderConnectionGate\(code\)/,
  );
  const verifyRequest = source.indexOf(
    "await request('/api/auth/verify'",
  );
  const postVerifyBootstrap = source.indexOf(
    "auth = await request('/api/auth/bootstrap')",
    verifyRequest,
  );
  const postVerifyStart = source.indexOf(
    'await startApplication()',
    postVerifyBootstrap,
  );
  assert.ok(verifyRequest >= 0);
  assert.ok(postVerifyBootstrap > verifyRequest);
  assert.ok(postVerifyStart > postVerifyBootstrap);
});

test('Pocket navigation paints cached routes before live refreshes finish', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  const switcherStart = source.indexOf('async function openSwitcher');
  const connectionSheetStart = source.indexOf(
    'async function openConnectionSheet',
  );
  const switcherBlock = source.slice(
    switcherStart,
    connectionSheetStart,
  );

  assert.match(
    source,
    /click: \(\) => \{[\s\S]*navigate\(\{ view: 'sessions', workspaceId: workspace\.id, sessionId: null \}\);[\s\S]*void loadSessions\(workspace\.id\)/,
  );
  assert.match(
    source,
    /if \(crossWorkspace && session\.workspaceId !== state\.route\.workspaceId\) \{[\s\S]*void loadSessions\(session\.workspaceId\);[\s\S]*\}[\s\S]*await openSession\(session\.id/,
  );
  assert.ok(switcherStart >= 0);
  assert.ok(connectionSheetStart > switcherStart);
  assert.doesNotMatch(switcherBlock, /await loadRecentSessions\(\)/);
  const refreshStart = switcherBlock.indexOf(
    'const pending = loadRecentSessions()',
  );
  const cachedPaint = switcherBlock.indexOf('render();', refreshStart);
  const sheetPaint = switcherBlock.indexOf('openSheet(', cachedPaint);
  const trailingPaint = switcherBlock.indexOf(
    'void pending.then(render)',
    sheetPaint,
  );
  assert.ok(refreshStart >= 0);
  assert.ok(cachedPaint > refreshStart);
  assert.ok(sheetPaint > cachedPaint);
  assert.ok(trailingPaint > sheetPaint);
  assert.match(switcherBlock, /state\.recentSessionsError/);
  assert.match(source, /Recent chats are unavailable|Couldn’t refresh recent chats/);
});

test('the application wires bounded, cancellable live refreshes and wake requests', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /const LIVE_REFRESH_DEBOUNCE_MS = 100/);
  assert.match(source, /const LIVE_REFRESH_REQUEST_MS = 6 \* 1000/);
  assert.match(source, /createLiveRefreshCoordinator\(\{/);
  assert.match(
    source,
    /async run\(\{ signal \}\)[\s\S]*timeoutMs: LIVE_REFRESH_REQUEST_MS/,
  );
  assert.match(
    source,
    /eventSource\.addEventListener\('change', \(\) => \{[\s\S]*transcriptRefresh\.schedule\(\)[\s\S]*metadataRefresh\.schedule\(\)/,
  );
  assert.match(
    source,
    /function stopEvents\(\)[\s\S]*transcriptRefresh\.stop\(\)[\s\S]*metadataRefresh\.stop\(\)/,
  );
  assert.match(source, /const RESUME_REQUEST_MS = 6 \* 1000/);
  assert.match(
    source,
    /request\('\/api\/auth\/touch'[\s\S]*timeoutMs: RESUME_REQUEST_MS/,
  );
  assert.match(source, /function discardFailedMessage\(message\)/);
  assert.match(
    source,
    /text: 'Delete'[\s\S]*click: \(\) => discardFailedMessage\(message\)/,
  );
});

test('sign-out purge removes the Pocket cache and root service worker', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /name\.startsWith\(SHELL_CACHE_PREFIX\)/);
  assert.match(source, /scriptUrl\.pathname === '\/service-worker\.js'/);
  assert.match(source, /registration\.unregister\(\)/);
  assert.match(source, /service_worker_retirement_failed/);
  assert.match(source, /transcript_cache_delete_blocked/);
  assert.doesNotMatch(
    source,
    /requestValue\.onblocked\s*=\s*resolve/,
  );
  assert.match(
    source,
    /if \(currentDevice\) await purgeLocalData\(\);[\s\S]*localPurgeCompleted: true/,
  );
  assert.match(source, /clientVersion: CLIENT_VERSION/);
  assert.match(source, /localStorage\.setItem\(ORIGIN_RETIRED_KEY, '1'\)/);
  assert.match(source, /response\.count !== 1/);
});

test('pending sends persist before draft clearing and recover for the full send window', async () => {
  const source = await fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
  const optimisticPush = source.indexOf('state.optimistic.push(optimistic)');
  const requiredPersistence = source.indexOf(
    'await persistPendingDeliveries({ required: true })',
    optimisticPush,
  );
  const draftClear = source.indexOf("field.value = ''", requiredPersistence);
  const durableActiveKey = source.indexOf(
    'activeDeliveryKey: idempotencyKey',
    optimisticPush - 500,
  );
  assert.ok(optimisticPush >= 0);
  assert.ok(durableActiveKey >= 0);
  assert.ok(durableActiveKey < requiredPersistence);
  assert.ok(requiredPersistence > optimisticPush);
  assert.ok(draftClear > requiredPersistence);
  assert.match(source, /const DELIVERY_RECOVERY_MS = 27_000/);
  assert.match(source, /await restorePendingDeliveries\(\)/);
  assert.match(source, /void recoverPendingDeliveries\(\)/);
  assert.match(
    source,
    /activeDeliveryKey\s*\|\|\s*message\.idempotencyKey/,
  );
  assert.match(
    source,
    /!error\.status\s*\|\|\s*error\.code === 'send_not_confirmed'[\s\S]*await checkDelivery\(optimistic\)/,
  );
  assert.match(
    source,
    /await deliverOptimistic\(optimistic, \{ deliveryIdentityPersisted: true \}\)/,
  );
  assert.match(
    source,
    /const deliveryIdentityChanged[\s\S]*if \(!deliveryIdentityPersisted \|\| deliveryIdentityChanged\) \{[\s\S]*await persistPendingDeliveries\(\{ required: true \}\)[\s\S]*fetch\(/,
  );
  const retryStart = source.indexOf('function retryMessage');
  const conflictStart = source.indexOf('function openDraftConflict', retryStart);
  const retryBlock = source.slice(retryStart, conflictStart);
  assert.match(
    retryBlock,
    /deliverOptimistic\(message, \{ replaceDraft: message\.replaceDraft === true \}\)/,
  );
  assert.doesNotMatch(
    retryBlock,
    /deliveryIdentityPersisted: true/,
  );
  assert.match(
    source,
    /applyDeliveryReceipt\(optimistic, payload\)[\s\S]*renderTranscript\(\)[\s\S]*refreshMessages\(optimistic\.sessionId, \{ full: true \}\)[\s\S]*await persistence/,
  );
  assert.doesNotMatch(
    source,
    /setTimeout\(\(\) => refreshMessages\(optimistic\.sessionId, \{ full: true \}\), 120\)/,
  );
  const persistStart = source.indexOf(
    'async function persistPendingDeliveries',
  );
  const restoreStart = source.indexOf(
    'async function restorePendingDeliveries',
  );
  const clearCacheStart = source.indexOf(
    'async function clearTranscriptCache',
  );
  const startApplicationStart = source.indexOf(
    'async function startApplication',
  );
  const restoreRouteStart = source.indexOf(
    'async function restoreRoute',
  );
  const persistBlock = source.slice(persistStart, restoreStart);
  const restoreBlock = source.slice(restoreStart, clearCacheStart);
  const startApplicationBlock = source.slice(
    startApplicationStart,
    restoreRouteStart,
  );
  const persistDiscard = persistBlock.indexOf(
    'discardTerminalUnconfirmed()',
  );
  const persistSnapshot = persistBlock.indexOf(
    'pendingDeliverySnapshot()',
  );
  const restoreDiscard = restoreBlock.indexOf(
    'discardTerminalUnconfirmed()',
  );
  const restoreWrite = restoreBlock.indexOf('cacheSet(');
  const startupRestore = startApplicationBlock.indexOf(
    'await restorePendingDeliveries()',
  );
  const startupRecovery = startApplicationBlock.indexOf(
    'void recoverPendingDeliveries()',
  );

  assert.ok(persistStart >= 0);
  assert.ok(restoreStart > persistStart);
  assert.ok(clearCacheStart > restoreStart);
  assert.ok(startApplicationStart >= 0);
  assert.ok(restoreRouteStart > startApplicationStart);
  assert.ok(persistDiscard >= 0);
  assert.ok(persistSnapshot > persistDiscard);
  assert.ok(restoreDiscard >= 0);
  assert.ok(restoreWrite > restoreDiscard);
  assert.ok(startupRestore >= 0);
  assert.ok(startupRecovery > startupRestore);
  assert.match(
    startApplicationBlock,
    /Promise\.all\(\[[\s\S]*refreshWorkspaces\(\)[\s\S]*loadRecentSessions\(\)[\s\S]*\]\)/,
  );
});
