import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ConfigStore,
  administrativelyRetireDeletedDevice,
  beginOriginRetirement,
  configRevision,
  createConfig,
  getVerificationCode,
  loadConfig,
  migrateToDedicatedOrigin,
  originRetirementComplete,
  remainingOriginRetirementDeviceIds,
  rotatePairing,
  saveConfig,
  setReauthenticationMode,
  validateConfig,
} from '../src/config.mjs';
import {
  DEVICE_SESSION_TTL_SECONDS,
  REAUTHENTICATION_MODE_FACE_ID,
  REAUTHENTICATION_MODE_TAILSCALE_SESSION,
} from '../src/constants.mjs';

test('configuration is loopback-only and stores only a pairing digest', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conductor-pocket-config-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const { config, pairingCode } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
    now: 1_000,
  });

  assert.equal(config.bindHost, '127.0.0.1');
  assert.equal(config.requireTailscaleIdentity, false);
  assert.equal(
    config.reauthenticationMode,
    REAUTHENTICATION_MODE_FACE_ID,
  );
  assert.equal(config.rpId, '127.0.0.1');
  assert.notEqual(config.pairing.codeHash, pairingCode);
  assert.equal(JSON.stringify(config).includes(pairingCode), false);
  assert.match(getVerificationCode(config), /^[A-Z0-9]{6}$/);

  await saveConfig(configPath, config);
  const saved = await loadConfig(configPath);
  assert.equal(saved.publicOrigin, 'http://127.0.0.1:4317');
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(directory)).mode & 0o077, 0);
});
test('configuration rejects a LAN or wildcard bind', () => {
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  assert.throws(
    () => validateConfig({ ...config, bindHost: '0.0.0.0' }),
    /loopback|127\.0\.0\.1/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...config,
        developmentMode: false,
        publicOrigin: 'http://pocket.example.com',
        rpId: 'pocket.example.com',
      }),
    /HTTPS/,
  );
});

test('dedicated-origin migration revokes old trust and rotates every browser secret', () => {
  const { config: createdConfig } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
    now: 1_000,
  });
  const config = structuredClone(createdConfig);
  config.allowedTailscaleLogin = 'alex@example.com';
  config.devices = [
    {
      id: 'old-device',
      sessionHash: 'old-session-hash',
      tailscaleLogin: 'alex@example.com',
    },
  ];
  const retirement = beginOriginRetirement(config, 2_000);
  retirement.devices = [];
  retirement.originRetirement.retiredDeviceIds = ['old-device'];
  const oldCsrfSecret = config.csrfSecret;
  const oldPairingHash = config.pairing.codeHash;

  const migrated = migrateToDedicatedOrigin(
    retirement,
    'https://conductor-pocket.example.ts.net',
    5_000,
  );

  assert.equal(
    migrated.config.publicOrigin,
    'https://conductor-pocket.example.ts.net',
  );
  assert.equal(migrated.config.rpId, 'conductor-pocket.example.ts.net');
  assert.equal(migrated.config.allowedTailscaleLogin, null);
  assert.deepEqual(migrated.config.devices, []);
  assert.notEqual(migrated.config.csrfSecret, oldCsrfSecret);
  assert.notEqual(migrated.config.pairing.codeHash, oldPairingHash);
  assert.notEqual(migrated.config.pairing.codeHash, migrated.pairingCode);
  assert.equal(
    JSON.stringify(migrated.config).includes(migrated.pairingCode),
    false,
  );
  assert.equal(
    migrated.config.pairing.expiresAt,
    new Date(5_000 + 15 * 60 * 1_000).toISOString(),
  );
  assert.equal(migrated.config.originRetirement, null);
});

test('origin migration requires every original device to self-retire', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.devices = [
    { id: 'phone-a' },
    { id: 'phone-b' },
  ];
  const retirement = beginOriginRetirement(config, 2_000);

  assert.equal(retirement.pairing, null);
  assert.throws(
    () => rotatePairing(retirement),
    /Pairing stays disabled/,
  );
  assert.deepEqual(retirement.originRetirement.requiredDeviceIds, [
    'phone-a',
    'phone-b',
  ]);
  assert.equal(originRetirementComplete(retirement), false);
  assert.throws(
    () =>
      migrateToDedicatedOrigin(
        retirement,
        'https://conductor-pocket.example.ts.net',
      ),
    /Every old-origin device/,
  );

  retirement.devices = [];
  retirement.originRetirement.retiredDeviceIds = ['phone-a', 'phone-b'];
  assert.equal(originRetirementComplete(retirement), true);
});

test('deleted-app administrative retirement revokes only the exact device and preserves its audit', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.devices = [
    {
      id: 'phone-a',
      sessionHash: 'session-a',
      previousSessionHash: 'previous-a',
      previousSessionExpiresAt: '2026-07-28T12:00:00.000Z',
    },
  ];
  const retirement = beginOriginRetirement(config, 2_000);
  const sourceRevision = configRevision(retirement);
  const oldCsrfSecret = retirement.csrfSecret;
  const recovered = administrativelyRetireDeletedDevice(retirement, {
    deviceId: 'phone-a',
    expectedOrigin: retirement.publicOrigin,
    expectedRevision: sourceRevision,
    operatorUid: 501,
    operatorUsername: 'alex',
    operatorHost: 'alex-mac',
    now: 3_000,
  });

  assert.deepEqual(recovered.devices, []);
  assert.deepEqual(recovered.originRetirement.retiredDeviceIds, []);
  assert.deepEqual(
    recovered.originRetirement.administrativeAttestations,
    [
      {
        deviceId: 'phone-a',
        basis: 'user_reported_ios_home_screen_app_deleted',
        receiptStatus: 'missing',
        localPurgeStatus: 'unverified',
        attestedAt: new Date(3_000).toISOString(),
        sourceConfigRevision: sourceRevision,
        operatorUid: 501,
        operatorUsername: 'alex',
        operatorHost: 'alex-mac',
      },
    ],
  );
  assert.notEqual(recovered.csrfSecret, oldCsrfSecret);
  assert.equal(originRetirementComplete(recovered), true);
  assert.notEqual(configRevision(recovered), sourceRevision);

  const migrated = migrateToDedicatedOrigin(
    recovered,
    'https://conductor-pocket.example.ts.net',
    4_000,
  ).config;
  assert.equal(migrated.originRetirement, null);
  assert.equal(migrated.completedOriginRetirements.length, 1);
  assert.deepEqual(
    migrated.completedOriginRetirements[0].administrativeAttestations,
    recovered.originRetirement.administrativeAttestations,
  );
  assert.equal(
    migrated.completedOriginRetirements[0].completedAt,
    new Date(4_000).toISOString(),
  );
});

test('administrative retirement fails closed on stale or ambiguous state', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.devices = [{ id: 'phone-a', sessionHash: 'session-a' }];
  const retirement = beginOriginRetirement(config, 2_000);
  const options = {
    deviceId: 'phone-a',
    expectedOrigin: retirement.publicOrigin,
    expectedRevision: configRevision(retirement),
    operatorUid: 501,
    operatorUsername: 'alex',
    operatorHost: 'alex-mac',
    now: 3_000,
  };

  assert.throws(
    () =>
      administrativelyRetireDeletedDevice(retirement, {
        ...options,
        expectedRevision: 'stale-revision-value-that-is-long-enough',
      }),
    /revision is stale/,
  );
  assert.throws(
    () =>
      administrativelyRetireDeletedDevice(retirement, {
        ...options,
        expectedOrigin: 'https://other.example.ts.net',
      }),
    /expected old origin/,
  );
  assert.throws(
    () =>
      administrativelyRetireDeletedDevice(retirement, {
        ...options,
        deviceId: 'phone-b',
      }),
    /not part of the armed retirement/,
  );
  assert.throws(
    () => administrativelyRetireDeletedDevice(config, options),
    /not armed/,
  );

  const selfRetired = structuredClone(retirement);
  selfRetired.devices = [];
  selfRetired.originRetirement.retiredDeviceIds = ['phone-a'];
  assert.throws(
    () =>
      administrativelyRetireDeletedDevice(selfRetired, {
        ...options,
        expectedRevision: configRevision(selfRetired),
      }),
    /self-purge receipt/,
  );
});

test('retirement evidence cannot overlap and mixed evidence can complete', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.devices = [
    { id: 'phone-a', sessionHash: 'session-a' },
    { id: 'phone-b', sessionHash: 'session-b' },
  ];
  const retirement = beginOriginRetirement(config, 2_000);
  const firstRecovery = administrativelyRetireDeletedDevice(retirement, {
    deviceId: 'phone-b',
    expectedOrigin: retirement.publicOrigin,
    expectedRevision: configRevision(retirement),
    operatorUid: 501,
    operatorUsername: 'alex',
    operatorHost: 'alex-mac',
    now: 2_500,
  });
  assert.equal(originRetirementComplete(firstRecovery), false);
  assert.deepEqual(
    remainingOriginRetirementDeviceIds(firstRecovery),
    ['phone-a'],
  );
  assert.deepEqual(
    firstRecovery.devices.map((device) => device.id),
    ['phone-a'],
  );

  retirement.devices = retirement.devices.filter(
    (device) => device.id === 'phone-b',
  );
  retirement.originRetirement.retiredDeviceIds = ['phone-a'];
  const recovered = administrativelyRetireDeletedDevice(retirement, {
    deviceId: 'phone-b',
    expectedOrigin: retirement.publicOrigin,
    expectedRevision: configRevision(retirement),
    operatorUid: 501,
    operatorUsername: 'alex',
    operatorHost: 'alex-mac',
    now: 3_000,
  });
  assert.equal(originRetirementComplete(recovered), true);

  const overlap = structuredClone(recovered);
  overlap.originRetirement.retiredDeviceIds.push('phone-b');
  assert.throws(
    () => validateConfig(overlap),
    /cannot record both/,
  );

  const incompleteAudit = structuredClone(recovered);
  incompleteAudit.originRetirement = null;
  incompleteAudit.completedOriginRetirements = [
    {
      ...recovered.originRetirement,
      administrativeAttestations: [],
      completedAt: new Date(4_000).toISOString(),
    },
  ];
  assert.throws(
    () => validateConfig(incompleteAudit),
    /missing retirement evidence/,
  );
});

test('config revision changes for same-origin retirement and pairing updates', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.devices = [{ id: 'phone-a', sessionHash: 'session-a' }];
  const initial = configRevision(config);
  const retirement = beginOriginRetirement(config, 2_000);
  const armed = configRevision(retirement);
  assert.notEqual(armed, initial);
  retirement.devices = [];
  retirement.originRetirement.retiredDeviceIds = ['phone-a'];
  assert.notEqual(configRevision(retirement), initial);
  assert.notEqual(configRevision(retirement), armed);
});

test('live config updates reload the latest locked file before mutating', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-config-store-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const { config } = createConfig({
    publicOrigin: 'https://pocket.example.ts.net',
  });
  await saveConfig(configPath, config);
  const store = new ConfigStore(configPath, config);

  await saveConfig(configPath, {
    ...config,
    allowedTailscaleLogin: 'alex@example.com',
  });
  await store.update((draft) => {
    draft.devices.push({ id: 'phone-a' });
    return draft;
  });

  const saved = await loadConfig(configPath);
  assert.equal(saved.allowedTailscaleLogin, 'alex@example.com');
  assert.deepEqual(saved.devices, [
    {
      id: 'phone-a',
      lockGeneration: 0,
      previousSessionHash: null,
      previousSessionExpiresAt: null,
      sessionExpiresAt: null,
      trustedUntil: null,
      lockedAt: null,
    },
  ]);
});

test('trusted Tailnet mode migrates paired devices once and starts locked', () => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const { config } = createConfig({
    publicOrigin: 'https://pocket.example.ts.net',
  });
  config.allowedTailscaleLogin = 'alex@example.com';
  config.devices = [
    {
      id: 'phone-a',
      sessionHash: 'session-a',
      tailscaleLogin: 'alex@example.com',
    },
  ];

  const trusted = setReauthenticationMode(
    config,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    now,
  );
  assert.equal(
    trusted.reauthenticationMode,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
  );
  assert.deepEqual(trusted.devices[0], {
    id: 'phone-a',
    sessionHash: 'session-a',
    tailscaleLogin: 'alex@example.com',
    lockGeneration: 1,
    previousSessionHash: null,
    previousSessionExpiresAt: null,
    sessionExpiresAt: new Date(
      now + DEVICE_SESSION_TTL_SECONDS * 1_000,
    ).toISOString(),
    trustedUntil: null,
    lockedAt: new Date(now).toISOString(),
  });

  const repeated = setReauthenticationMode(
    trusted,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    now + 60_000,
  );
  assert.deepEqual(repeated, trusted);
  assert.notEqual(configRevision(trusted), configRevision(config));
});

test('trusted Tailnet mode fails closed without an exact pinned identity and expiry', () => {
  const { config } = createConfig({
    publicOrigin: 'https://pocket.example.ts.net',
  });
  config.devices = [
    {
      id: 'phone-a',
      tailscaleLogin: 'alex@example.com',
    },
  ];
  assert.throws(
    () =>
      setReauthenticationMode(
        config,
        REAUTHENTICATION_MODE_TAILSCALE_SESSION,
      ),
    /paired, pinned Tailscale identity/,
  );

  config.allowedTailscaleLogin = 'alex@example.com';
  const trusted = setReauthenticationMode(
    config,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    1_000,
  );
  assert.throws(
    () =>
      validateConfig({
        ...trusted,
        devices: trusted.devices.map((device) => ({
          ...device,
          sessionExpiresAt: null,
        })),
      }),
    /server-side device expiry/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...trusted,
        devices: trusted.devices.map((device) => ({
          ...device,
          tailscaleLogin: 'other@example.com',
        })),
      }),
    /pinned identity/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...trusted,
        devices: trusted.devices.map((device) => ({
          ...device,
          previousSessionHash: 'orphaned-old-session',
          previousSessionExpiresAt: null,
        })),
      }),
    /hash and expiry/,
  );
});

test('dedicated-origin migration resets trusted access before new pairing', () => {
  const { config } = createConfig({
    publicOrigin: 'https://shared.example.ts.net',
  });
  config.allowedTailscaleLogin = 'alex@example.com';
  config.devices = [
    {
      id: 'phone-a',
      sessionHash: 'session-a',
      tailscaleLogin: 'alex@example.com',
    },
  ];
  const trusted = setReauthenticationMode(
    config,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    1_000,
  );
  const retirement = beginOriginRetirement(trusted, 2_000);
  retirement.devices = [];
  retirement.originRetirement.retiredDeviceIds = ['phone-a'];

  const migrated = migrateToDedicatedOrigin(
    retirement,
    'https://conductor-pocket.example.ts.net',
    3_000,
  );
  assert.equal(
    migrated.config.reauthenticationMode,
    REAUTHENTICATION_MODE_FACE_ID,
  );
  assert.equal(migrated.config.allowedTailscaleLogin, null);
  assert.deepEqual(migrated.config.devices, []);
});
