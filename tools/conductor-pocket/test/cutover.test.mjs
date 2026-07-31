import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginOriginRetirement,
  createConfig,
  migrateToDedicatedOrigin,
} from '../src/config.mjs';
import {
  activateAdministrativeRetirement,
  migrateRelayOrigin,
  parseAdministrativeRetirementArgs,
  parseCutoverArgs,
  removeMainPocketRoot,
  resumeDedicatedOrigin,
} from '../scripts/lib/cutover.mjs';

function retiredOldConfig() {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
    now: 1_000,
  });
  config.devices = [{ id: 'old-phone' }];
  const retirement = beginOriginRetirement(config, 2_000);
  retirement.devices = [];
  retirement.originRetirement.retiredDeviceIds = ['old-phone'];
  return retirement;
}

test('cutover arguments allow only normal, exact legacy attestation, or complete recovery', () => {
  assert.deepEqual(parseCutoverArgs([]), {
    attestNoOldDevices: false,
    administrativeRetirement: null,
  });
  assert.deepEqual(parseCutoverArgs(['--attest-no-old-devices']), {
    attestNoOldDevices: true,
    administrativeRetirement: null,
  });
  assert.throws(
    () =>
      parseCutoverArgs([
        '--administratively-retire-device=phone-a',
      ]),
    /unsupported option/,
  );
  assert.throws(
    () => parseCutoverArgs(['--adminstratively-retire-device', 'phone-a']),
    /unsupported option/,
  );
  assert.throws(
    () =>
      parseCutoverArgs([
        '--attest-no-old-devices',
        'unexpected',
      ]),
    /unsupported option/,
  );
});

test('administrative retirement arguments require exact state and both acknowledgements', () => {
  assert.equal(parseAdministrativeRetirementArgs([]), null);
  const parsed = parseAdministrativeRetirementArgs([
    '--administratively-retire-device',
    'phone-a',
    '--expect-origin',
    'https://shared.example.ts.net',
    '--expect-revision',
    'revision-a',
    '--confirm-reported-ios-app-deleted',
    '--acknowledge-local-purge-unverified',
  ]);
  assert.deepEqual(parsed, {
    deviceId: 'phone-a',
    expectedOrigin: 'https://shared.example.ts.net',
    expectedRevision: 'revision-a',
  });
  assert.throws(
    () =>
      parseAdministrativeRetirementArgs([
        '--administratively-retire-device',
        'phone-a',
        '--expect-origin',
        'https://shared.example.ts.net',
        '--expect-revision',
        'revision-a',
        '--confirm-reported-ios-app-deleted',
      ]),
    /acknowledge-local-purge-unverified/,
  );
  assert.throws(
    () =>
      parseAdministrativeRetirementArgs([
        '--administratively-retire-device',
        'phone-a',
        '--administratively-retire-device',
        'phone-b',
        '--expect-origin',
        'https://shared.example.ts.net',
        '--expect-revision',
        'revision-a',
        '--confirm-reported-ios-app-deleted',
        '--acknowledge-local-purge-unverified',
      ]),
    /provided only once/,
  );
  assert.throws(
    () =>
      parseAdministrativeRetirementArgs([
        '--administratively-retire-device',
        'phone-a',
        '--expect-origin',
        'https://shared.example.ts.net',
        '--expect-revision',
        'revision-a',
        '--confirm-reported-ios-app-deleted',
        '--acknowledge-local-purge-unverified',
        '--attest-no-old-devices',
      ]),
    /unsupported option/,
  );
  assert.throws(
    () =>
      parseAdministrativeRetirementArgs([
        '--administratively-retire-device',
        'phone-a',
        '--expect-origin',
        'https://shared.example.ts.net',
        '--expect-revision',
        'revision-a',
        '--confirm-reported-ios-app-deleted',
        '--acknowledge-local-purge-unverified',
        'unexpected',
      ]),
    /unexpected argument/,
  );
  assert.throws(
    () =>
      parseAdministrativeRetirementArgs([
        '--administratively-retire-device',
        'phone-a',
        '--expect-origin',
        'https://shared.example.ts.net',
        '--expect-revision',
        'revision-a',
        '--confirm-reported-ios-app-deleted=false',
        '--acknowledge-local-purge-unverified',
      ]),
    /unsupported option/,
  );
});

test('administrative retirement activates and verifies without migrating', async () => {
  const nextConfig = {
    publicOrigin: 'https://shared.example.ts.net',
  };
  const sequence = [];
  const activated = await activateAdministrativeRetirement({
    nextConfig,
    save: async () => sequence.push('save'),
    restart: async () => sequence.push('restart'),
    verify: async (origin) => sequence.push(`verify:${origin}`),
    stopRelay: async () => sequence.push('stop'),
  });
  assert.equal(activated, nextConfig);
  assert.deepEqual(sequence, [
    'save',
    'restart',
    'verify:https://shared.example.ts.net',
  ]);
});

test('failed administrative activation never restores a revoked token and stops the relay', async () => {
  const nextConfig = {
    publicOrigin: 'https://shared.example.ts.net',
  };
  const sequence = [];
  await assert.rejects(
    activateAdministrativeRetirement({
      nextConfig,
      save: async () => sequence.push('save-revoked'),
      restart: async () => sequence.push('restart'),
      verify: async () => {
        sequence.push('verify-failed');
        throw new Error('old HTTPS revision mismatch');
      },
      stopRelay: async () => sequence.push('stop'),
    }),
    /old HTTPS revision mismatch/,
  );
  assert.deepEqual(sequence, [
    'save-revoked',
    'restart',
    'verify-failed',
    'stop',
  ]);
});

test('a rejected administrative save stops because it may have committed before throwing', async () => {
  const sequence = [];
  await assert.rejects(
    activateAdministrativeRetirement({
      nextConfig: {
        publicOrigin: 'https://shared.example.ts.net',
      },
      save: async () => {
        sequence.push('save-failed');
        throw new Error('atomic save failed');
      },
      restart: async () => sequence.push('restart'),
      verify: async () => sequence.push('verify'),
      stopRelay: async () => sequence.push('stop'),
    }),
    /atomic save failed/,
  );
  assert.deepEqual(sequence, ['save-failed', 'stop']);
});

test('administrative activation reports both verification and fail-closed stop failures', async () => {
  await assert.rejects(
    activateAdministrativeRetirement({
      nextConfig: {
        publicOrigin: 'https://shared.example.ts.net',
      },
      save: async () => {},
      restart: async () => {},
      verify: async () => {
        throw new Error('old HTTPS revision mismatch');
      },
      stopRelay: async () => {
        throw new Error('launchd stop failed');
      },
    }),
    (error) =>
      error instanceof AggregateError &&
      /stopping the relay also failed/.test(error.message) &&
      error.errors.length === 2,
  );
});

test('main-node cleanup performs only the exact noninteractive root mutation', async () => {
  const before = {
    TCP: { 443: { HTTPS: true } },
    Web: {
      'shared.example.ts.net:443': {
        Handlers: {
          '/': { Proxy: 'http://127.0.0.1:4317' },
          '/biologix-blueprint': { Proxy: 'http://127.0.0.1:4173' },
        },
      },
    },
  };
  const after = structuredClone(before);
  delete after.Web['shared.example.ts.net:443'].Handlers['/'];
  const calls = [];
  const result = await removeMainPocketRoot({
    mainCli: '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    rpId: 'shared.example.ts.net',
    port: 4317,
    runCommand: async (_cli, argumentsList) => {
      calls.push(argumentsList);
      return {
        stdout: JSON.stringify(calls.length === 1 ? before : after),
      };
    },
    requirePocket: true,
  });

  assert.equal(result.removed, true);
  assert.deepEqual(calls, [
    ['serve', 'status', '--json'],
    ['serve', '--yes', '--https=443', '--set-path=/', 'off'],
    ['serve', 'status', '--json'],
  ]);
});

test('replay preserves a foreign main-node root instead of guessing', async () => {
  const status = {
    TCP: { 443: { HTTPS: true } },
    Web: {
      'shared.example.ts.net:443': {
        Handlers: {
          '/': { Proxy: 'http://127.0.0.1:9999' },
        },
      },
    },
  };
  let calls = 0;
  const result = await removeMainPocketRoot({
    mainCli: '/main/tailscale',
    rpId: 'shared.example.ts.net',
    port: 4317,
    runCommand: async () => {
      calls += 1;
      return { stdout: JSON.stringify(status) };
    },
  });
  assert.equal(result.state, 'foreign');
  assert.equal(result.removed, false);
  assert.equal(calls, 1);
});

test('migration rollback restores and verifies the old live relay', async () => {
  const oldConfig = retiredOldConfig();
  const sequence = [];
  await assert.rejects(
    migrateRelayOrigin({
      oldConfig,
      dedicatedOrigin: 'https://conductor-pocket.example.ts.net',
      save: async (config) => sequence.push(`save:${config.rpId}`),
      restart: async (config) => sequence.push(`restart:${config.rpId}`),
      verify: async (origin) => {
        sequence.push(`verify:${origin}`);
        if (origin.includes('conductor-pocket')) {
          throw new Error('new endpoint unavailable');
        }
      },
      removeOldRoot: async () => sequence.push('remove-root'),
      now: 5_000,
    }),
    /new endpoint unavailable/,
  );
  assert.deepEqual(sequence, [
    'save:conductor-pocket.example.ts.net',
    'restart:conductor-pocket.example.ts.net',
    'verify:https://conductor-pocket.example.ts.net',
    'save:shared.example.ts.net',
    'restart:shared.example.ts.net',
    'verify:https://shared.example.ts.net',
  ]);
});

test('migration surfaces both the primary and rollback failures', async () => {
  const oldConfig = retiredOldConfig();
  await assert.rejects(
    migrateRelayOrigin({
      oldConfig,
      dedicatedOrigin: 'https://conductor-pocket.example.ts.net',
      save: async () => {},
      restart: async () => {},
      verify: async (origin) => {
        throw new Error(
          origin.includes('conductor-pocket')
            ? 'new endpoint unavailable'
            : 'old endpoint unavailable',
        );
      },
      removeOldRoot: async () => {},
    }),
    (error) =>
      error instanceof AggregateError &&
      /restoring the old relay also failed/.test(error.message) &&
      error.errors.length === 2,
  );
});

test('an interrupted migrated state resumes cleanup and prints a fresh pairing secret', async () => {
  const migrated = migrateToDedicatedOrigin(
    retiredOldConfig(),
    'https://conductor-pocket.example.ts.net',
    5_000,
  ).config;
  const sequence = [];
  const resumed = await resumeDedicatedOrigin({
    config: migrated,
    verify: async () => sequence.push('verify'),
    removeOldRoot: async () => {
      sequence.push('remove-root');
      return { removed: true };
    },
    save: async () => sequence.push('save-fresh-pairing'),
    restart: async () => sequence.push('restart'),
    now: 6_000,
  });

  assert.deepEqual(sequence, [
    'verify',
    'remove-root',
    'save-fresh-pairing',
    'restart',
    'verify',
  ]);
  assert.match(resumed.pairingCode, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(resumed.config.pairing.codeHash, resumed.pairingCode);
});

test('root-removal failure after dedicated verification never rolls config backward', async () => {
  const oldConfig = retiredOldConfig();
  const savedOrigins = [];
  await assert.rejects(
    migrateRelayOrigin({
      oldConfig,
      dedicatedOrigin: 'https://conductor-pocket.example.ts.net',
      save: async (config) => savedOrigins.push(config.publicOrigin),
      restart: async () => {},
      verify: async () => {},
      removeOldRoot: async () => {
        throw new Error('main cleanup failed');
      },
    }),
    /main cleanup failed/,
  );
  assert.deepEqual(savedOrigins, [
    'https://conductor-pocket.example.ts.net',
  ]);
});
