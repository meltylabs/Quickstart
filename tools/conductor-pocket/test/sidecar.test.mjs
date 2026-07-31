import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DATA_DIRECTORY,
  RELAY_LABEL,
  RELAY_LAUNCH_AGENT_PATH,
  assertRelayLaunchProfile,
  assertSupportedStatusVersion,
  launchdNotFound,
  launchdArguments,
  relayListenerPids,
  removeVerifiedStaleSocket,
  sidecarCliArguments,
  sidecarDaemonArguments,
  statusVersion,
  validatedSidecarAuthUrl,
  versionAtLeast,
  waitForSidecarLoginOutcome,
  waitForSidecarResponse,
  waitForRelayShutdown,
  xml,
} from '../scripts/lib/sidecar.mjs';

test('every dedicated-node CLI command is bound to its private socket', () => {
  assert.deepEqual(
    sidecarCliArguments(
      ['serve', 'status', '--json'],
      '/private/conductor-pocket/tailscaled.sock',
    ),
    [
      '--socket=/private/conductor-pocket/tailscaled.sock',
      'serve',
      'status',
      '--json',
    ],
  );
  assert.throws(
    () => sidecarCliArguments(['status'], 'relative.sock'),
    /must be absolute/,
  );
});

test('dedicated daemon launch arguments expose only the audited userspace socket', () => {
  assert.deepEqual(
    sidecarDaemonArguments('/opt/tailscale/bin/tailscaled', {
      stateDirectory: '/private/conductor-pocket/tailscale',
      socketPath: '/private/conductor-pocket/tailscaled.sock',
    }),
    [
      '/opt/tailscale/bin/tailscaled',
      '--tun=userspace-networking',
      '--statedir=/private/conductor-pocket/tailscale',
      '--socket=/private/conductor-pocket/tailscaled.sock',
      '--port=0',
    ],
  );
});

test('loaded launchd arguments are parsed and compared independently of the plist', () => {
  assert.deepEqual(
    launchdArguments(`
arguments = {
  /opt/tailscale/bin/tailscaled
  --tun=userspace-networking
  --socket=/private/tailscaled.sock
}
working directory = /private
`),
    [
      '/opt/tailscale/bin/tailscaled',
      '--tun=userspace-networking',
      '--socket=/private/tailscaled.sock',
    ],
  );
  assert.equal(launchdArguments('state = running'), null);
});

test('an already-unloaded launchd job is recognized for print and bootout', () => {
  assert.equal(
    launchdNotFound({
      code: 113,
      stderr:
        'Bad request.\\nCould not find service "example" in domain for user gui: 501\\n',
    }),
    true,
  );
  assert.equal(
    launchdNotFound({
      code: 3,
      stderr: 'Boot-out failed: 3: No such process\\n',
    }),
    true,
  );
  assert.equal(
    launchdNotFound({
      code: 5,
      stderr: 'Boot-out failed: 5: Input/output error\\n',
    }),
    false,
  );
});

test('LaunchAgent XML values are escaped', () => {
  assert.equal(xml('a&<b>"\''), 'a&amp;&lt;b&gt;&quot;&apos;');
});

test('relay LaunchAgent and listener ownership are attested together', async () => {
  const configPath = path.join(DATA_DIRECTORY, 'config.json');
  const runtime = path.join(
    DATA_DIRECTORY,
    'runtimes',
    'runtime-0.2.0-test',
  );
  const cliPath = path.join(runtime, 'src', 'cli.mjs');
  const argumentsList = [
    '/opt/homebrew/bin/node',
    '--no-warnings=ExperimentalWarning',
    cliPath,
    'serve',
    '--config',
    configPath,
  ];
  const launchdOutput = `
path = ${RELAY_LAUNCH_AGENT_PATH}
state = running
arguments = {
  ${argumentsList.join('\n  ')}
}
pid = 4242
`;
  const profile = await assertRelayLaunchProfile(
    { configPath, port: 4317 },
    {
      stat: async () => ({ mode: 0o100600 }),
      readPlist: async () => ({
        Label: RELAY_LABEL,
        ProgramArguments: argumentsList,
        WorkingDirectory: runtime,
        RunAtLoad: true,
      }),
      readLaunchd: async () => launchdOutput,
      readListenerPids: async () => [4242],
      access: async () => {},
      realpath: async (value) => value,
    },
  );
  assert.equal(profile.pid, 4242);
  assert.equal(profile.workingDirectory, runtime);

  await assert.rejects(
    assertRelayLaunchProfile(
      { configPath, port: 4317 },
      {
        stat: async () => ({ mode: 0o100600 }),
        readPlist: async () => ({
          Label: RELAY_LABEL,
          ProgramArguments: argumentsList,
          WorkingDirectory: runtime,
          RunAtLoad: true,
        }),
        readLaunchd: async () => launchdOutput,
        readListenerPids: async () => [9999],
        access: async () => {},
        realpath: async (value) => value,
      },
    ),
    /listener is not the audited LaunchAgent/,
  );
});

test('relay listener parsing and shutdown require both port and health death', async () => {
  assert.deepEqual(
    await relayListenerPids(4317, {
      runCommand: async () => ({
        stdout: 'p42\nf10\np42\np43\n',
      }),
    }),
    [42, 43],
  );
  assert.deepEqual(
    await relayListenerPids(4317, {
      runCommand: async () => {
        const error = new Error('no listeners');
        error.code = 1;
        throw error;
      },
    }),
    [],
  );

  let attempt = 0;
  await waitForRelayShutdown(
    { port: 4317, expectedPid: 42 },
    {
      readListenerPids: async () => (attempt === 0 ? [42] : []),
      probeHealth: async () => {
        const reachable = attempt === 0;
        attempt += 1;
        return reachable;
      },
      attempts: 2,
      delayMs: 0,
      sleep: async () => {},
    },
  );
  await assert.rejects(
    waitForRelayShutdown(
      { port: 4317, expectedPid: 42 },
      {
        readListenerPids: async () => [99],
        probeHealth: async () => false,
        attempts: 1,
      },
    ),
    /unexpected process/,
  );
  await assert.rejects(
    waitForRelayShutdown(
      { port: 4317, expectedPid: 42 },
      {
        readListenerPids: async () => [],
        probeHealth: async () => true,
        attempts: 1,
      },
    ),
    /remained reachable/,
  );
});

test('relay install gives cold startup and rollback a thirty-second health window', async () => {
  const source = await fs.readFile(
    new URL('../scripts/install-relay.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /const RELAY_START_ATTEMPTS = 150/);
  assert.match(
    source,
    /attempt < RELAY_START_ATTEMPTS/,
  );
  assert.match(
    source,
    /error instanceof AggregateError[\s\S]*error\.errors\.map/,
  );
});

test('trusted sessions fail closed unless Pocket owns the audited sidecar origin', async () => {
  const source = await fs.readFile(
    new URL('../src/cli.mjs', import.meta.url),
    'utf8',
  );
  const gateStart = source.indexOf(
    'async function assertTrustedSessionIngress',
  );
  const nextFunction = source.indexOf(
    'async function macName',
    gateStart,
  );
  const gate = source.slice(gateStart, nextFunction);
  assert.ok(gateStart >= 0);
  assert.ok(nextFunction > gateStart);
  assert.match(
    gate,
    /config\.publicOrigin !== tailscale\.publicOrigin/,
  );
  assert.match(gate, /config\.rpId !== tailscale\.dnsName/);
  assert.match(gate, /assertDoctorLaunchProfile/);
  assert.match(gate, /assertLockedSidecarPrefs/);
  assert.match(gate, /assertPrivateServeStatus/);
  assert.match(gate, /assertNoFunnel/);
  assert.match(gate, /assertSameTailnet/);
  assert.match(gate, /sidecar_identity_not_isolated/);
  assert.match(gate, /old_shared_root_still_configured/);
  assert.match(
    source,
    /async function mainTailscaleStatus\(executable\)/,
  );
  assert.match(
    gate,
    /mainTailscaleStatus\(tailscale\.executable\)/,
  );
  assert.doesNotMatch(
    source,
    /Applications\/Tailscale\.app\/Contents\/MacOS\/Tailscale/,
  );

  const prewriteGate = source.indexOf(
    'await assertTrustedSessionIngress(proposed)',
  );
  const modeWrite = source.indexOf(
    'await saveConfig(configPath, proposed)',
    prewriteGate,
  );
  const serveGate = source.indexOf(
    'await assertTrustedSessionIngress(config)',
    source.indexOf('async function serve'),
  );
  const serverCreation = source.indexOf(
    'const server = createPocketServer',
    serveGate,
  );
  assert.ok(prewriteGate >= 0);
  assert.ok(modeWrite > prewriteGate);
  assert.ok(serveGate >= 0);
  assert.ok(serverCreation > serveGate);
  assert.match(source, /const RELAY_START_ATTEMPTS = 150/);
  assert.match(
    source,
    /withOperationLock\([\s\S]*change Pocket authentication mode/,
  );
  assert.match(
    source,
    /await assertTrustedSessionIngress\(proposed\)[\s\S]*await fs\.access\(relayLaunchAgentPath\)[\s\S]*if \(isDeepStrictEqual\(prior, proposed\)\)[\s\S]*await ensureInstalledRelay\(prior\)/,
  );
  assert.match(
    source,
    /await saveConfig\(configPath, prior\)[\s\S]*await restartInstalledRelay\(prior\)/,
  );
  assert.match(source, /await stopInstalledRelay\(\)/);
});

test('the sidecar refuses Tailscale builds older than the security floor', () => {
  assert.equal(versionAtLeast('1.98.9', '1.98.9'), true);
  assert.equal(versionAtLeast('1.100.0', '1.98.9'), true);
  assert.equal(versionAtLeast('1.98.8', '1.98.9'), false);
  assert.equal(versionAtLeast('unknown', '1.98.9'), false);
  assert.equal(
    statusVersion({ Version: '1.98.9-t4fb758c39-g200941d74' }),
    '1.98.9',
  );
  assert.equal(
    assertSupportedStatusVersion({
      Version: '1.98.9-t4fb758c39-g200941d74',
    }),
    '1.98.9',
  );
  assert.throws(
    () => assertSupportedStatusVersion({ Version: '1.98.8-old' }),
    /running Tailscale daemon/,
  );
});

test('installer waits for a real socket-scoped daemon response', async () => {
  let reads = 0;
  const status = await waitForSidecarResponse({
    readStatus: async () => {
      reads += 1;
      if (reads < 3) throw new Error('connection refused');
      return { BackendState: 'NeedsLogin' };
    },
    delayMs: 0,
    sleep: async () => {},
  });
  assert.equal(reads, 3);
  assert.equal(status.BackendState, 'NeedsLogin');
});

test('sidecar login accepts only an exact Tailscale HTTPS authorization URL', () => {
  assert.equal(
    validatedSidecarAuthUrl('https://login.tailscale.com/a/Abc_123-xyz'),
    'https://login.tailscale.com/a/Abc_123-xyz',
  );
  assert.equal(validatedSidecarAuthUrl(''), null);
  for (const value of [
    'http://login.tailscale.com/a/abcdef',
    'https://login.tailscale.com.evil.example/a/abcdef',
    'https://user@login.tailscale.com/a/abcdef',
    'https://login.tailscale.com:443/a/abcdef',
    'https://login.tailscale.com:444/a/abcdef',
    ' https://login.tailscale.com/a/abcdef',
    'https://login.tailscale.com/a/abcdef?continue=evil',
    'https://login.tailscale.com/a/abcdef#fragment',
    'https://login.tailscale.com/a/abcdef%2Fextra',
    'https://login.tailscale.com/a/abcdef/extra',
    'https://login.tailscale.com/admin/abcdef',
  ]) {
    assert.throws(
      () => validatedSidecarAuthUrl(value),
      /untrusted login URL/,
    );
  }
});

test('sidecar login returns once the daemon owns a pending authorization', async () => {
  const statuses = [
    { BackendState: 'NeedsLogin', AuthURL: '' },
    {
      BackendState: 'NeedsLogin',
      AuthURL: 'https://login.tailscale.com/a/abcdef123456',
    },
  ];
  const outcome = await waitForSidecarLoginOutcome({
    readStatus: async () => statuses.shift(),
    pollDelayMs: 0,
    sleep: async () => {},
  });
  assert.equal(
    outcome.authUrl,
    'https://login.tailscale.com/a/abcdef123456',
  );
  assert.equal(outcome.status.BackendState, 'NeedsLogin');
});

test('sidecar login recognizes approval without requiring the helper process', async () => {
  const outcome = await waitForSidecarLoginOutcome({
    readStatus: async () => ({ BackendState: 'Running', AuthURL: '' }),
    pollDelayMs: 0,
    sleep: async () => {},
  });
  assert.equal(outcome.authUrl, null);
  assert.equal(outcome.status.BackendState, 'Running');
});

test('sidecar login deadline bounds a stalled status reader', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    waitForSidecarLoginOutcome({
      readStatus: async () => new Promise(() => {}),
      deadlineMs: 20,
      statusTimeoutMs: 5,
      pollDelayMs: 1,
    }),
    /stopped answering during login/,
  );
  assert.ok(Date.now() - startedAt < 200);
});

test('installer removes only a socket proven stale by a failed probe', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-socket-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const socketPath = path.join(directory, 'tailscaled.sock');
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  context.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  );

  assert.equal(
    await removeVerifiedStaleSocket(socketPath, {
      probe: async () => {
        const error = new Error('connection refused');
        throw error;
      },
    }),
    true,
  );
  await assert.rejects(fs.lstat(socketPath), (error) => error.code === 'ENOENT');
});

test('installer refuses to unlink a socket that still answers', async () => {
  await assert.rejects(
    removeVerifiedStaleSocket('/verified/socket', {
      lstat: async () => ({ isSocket: () => true }),
      probe: async () => ({ BackendState: 'Running' }),
      unlink: async () => {
        throw new Error('must not unlink');
      },
    }),
    /still answers/,
  );
});
