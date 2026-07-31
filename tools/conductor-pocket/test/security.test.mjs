import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ConfigStore,
  createConfig,
  loadConfig,
  saveConfig,
  setReauthenticationMode,
} from '../src/config.mjs';
import {
  DEVICE_SESSION_TTL_SECONDS,
  REAUTHENTICATION_MODE_TAILSCALE_SESSION,
  SESSION_ROTATION_GRACE_MS,
  SESSION_COOKIE,
  TRUSTED_DEVICE_TTL_MS,
  UNLOCK_IDLE_TTL_MS,
  UNLOCK_TTL_MS,
} from '../src/constants.mjs';
import { sha256 } from '../src/encoding.mjs';
import {
  SecurityManager,
  assertAuthenticationChallengeCurrent,
  assertAuthenticationGeneration,
  assertOriginRetirementRevocation,
  authenticationCookieRefresh,
  createUnlockWindow,
  evaluateTrustedDeviceSession,
  evaluateUnlockWindow,
} from '../src/security.mjs';

async function trustedSecurityFixture(context, now) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-trusted-security-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const rawSession =
    'trusted-session-token-with-enough-entropy-for-fixture';
  const { config: created } = createConfig({
    publicOrigin: 'https://pocket.example-tailnet.ts.net',
  });
  created.allowedTailscaleLogin = 'alex@example.com';
  created.devices = [
    {
      id: 'device-1',
      name: 'Test iPhone',
      tailscaleLogin: 'alex@example.com',
      createdAt: '2026-01-01T00:00:00Z',
      lastSeenAt: '2026-01-01T00:00:00Z',
      sessionHash: sha256(rawSession),
      passkey: {
        id: 'credential-1',
        publicKey: 'AA',
        counter: 0,
        transports: ['internal'],
        backedUp: true,
      },
    },
  ];
  const config = setReauthenticationMode(
    created,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    now,
  );
  config.devices[0].trustedUntil = new Date(
    now + TRUSTED_DEVICE_TTL_MS,
  ).toISOString();
  config.devices[0].lockedAt = null;
  await saveConfig(configPath, config);
  const store = new ConfigStore(configPath, config);
  const request = {
    headers: {
      cookie: `${SESSION_COOKIE}=${rawSession}`,
      origin: config.publicOrigin,
      'tailscale-user-login': 'alex@example.com',
    },
    socket: { remoteAddress: '100.64.0.1' },
  };
  return {
    config,
    configPath,
    rawSession,
    request,
    store,
  };
}

test('unlock window enforces both idle and absolute Face ID deadlines', () => {
  const startedAt = 1_000_000;
  const idleWindow = createUnlockWindow(startedAt);
  assert.equal(
    evaluateUnlockWindow(idleWindow, startedAt + UNLOCK_IDLE_TTL_MS - 1)
      .unlocked,
    true,
  );
  assert.equal(
    evaluateUnlockWindow(idleWindow, startedAt + UNLOCK_IDLE_TTL_MS).unlocked,
    false,
  );

  const activeWindow = createUnlockWindow(startedAt);
  const touched = evaluateUnlockWindow(
    activeWindow,
    startedAt + UNLOCK_IDLE_TTL_MS - 1_000,
    { touch: true },
  );
  assert.equal(touched.unlocked, true);
  assert.equal(
    touched.unlockedUntil,
    startedAt + 2 * UNLOCK_IDLE_TTL_MS - 1_000,
  );

  const nearAbsoluteDeadline = createUnlockWindow(startedAt);
  nearAbsoluteDeadline.idleUntil = nearAbsoluteDeadline.absoluteUntil;
  const capped = evaluateUnlockWindow(
    nearAbsoluteDeadline,
    startedAt + UNLOCK_TTL_MS - 1_000,
    { touch: true },
  );
  assert.equal(capped.unlockedUntil, startedAt + UNLOCK_TTL_MS);
  assert.equal(
    evaluateUnlockWindow(
      nearAbsoluteDeadline,
      startedAt + UNLOCK_TTL_MS,
    ).unlocked,
    false,
  );
});

test('trusted device requires both fixed server deadlines and no explicit lock', () => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const sessionExpiresAt = new Date(
    now + DEVICE_SESSION_TTL_SECONDS * 1_000,
  ).toISOString();
  const trustedUntil = new Date(
    now + TRUSTED_DEVICE_TTL_MS,
  ).toISOString();
  const device = {
    sessionExpiresAt,
    trustedUntil,
    lockedAt: null,
  };

  assert.deepEqual(evaluateTrustedDeviceSession(device, now), {
    sessionValid: true,
    unlocked: true,
    unlockedUntil: Date.parse(trustedUntil),
  });
  assert.equal(
    evaluateTrustedDeviceSession(
      device,
      Date.parse(trustedUntil),
    ).unlocked,
    false,
  );
  assert.deepEqual(
    evaluateTrustedDeviceSession(
      device,
      Date.parse(sessionExpiresAt),
    ),
    {
      sessionValid: false,
      unlocked: false,
      unlockedUntil: 0,
    },
  );
  assert.equal(
    evaluateTrustedDeviceSession(
      { ...device, lockedAt: new Date(now).toISOString() },
      now,
    ).unlocked,
    false,
  );
});

test('trusted Face ID rotates a hardened cookie while strict mode never extends it', () => {
  const rawSession =
    'rotated-session-token-with-enough-entropy-for-test';
  assert.equal(
    authenticationCookieRefresh(rawSession, {
      trustedMode: false,
    }),
    null,
  );
  assert.equal(
    authenticationCookieRefresh(rawSession, {
      trustedMode: true,
    }),
    [
      `${SESSION_COOKIE}=${rawSession}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      `Max-Age=${DEVICE_SESSION_TTL_SECONDS}`,
      'Priority=High',
    ].join('; '),
  );
});

test('a Face ID assertion cannot clear a newer manual lock', () => {
  assert.doesNotThrow(() =>
    assertAuthenticationGeneration({ lockGeneration: 4 }, 4),
  );
  assert.throws(
    () =>
      assertAuthenticationGeneration(
        { lockGeneration: 5 },
        4,
      ),
    (error) =>
      error.status === 409 &&
      error.code === 'authentication_state_changed',
  );
});

test('an in-flight Face ID assertion cannot consume a replaced challenge', () => {
  const pending = { expiresAt: 2_000 };
  assert.doesNotThrow(() =>
    assertAuthenticationChallengeCurrent(pending, pending, 1_999),
  );
  assert.throws(
    () =>
      assertAuthenticationChallengeCurrent(
        { expiresAt: 3_000 },
        pending,
        1_500,
      ),
    (error) =>
      error.status === 409 &&
      error.code === 'authentication_state_changed',
  );
  assert.throws(
    () =>
      assertAuthenticationChallengeCurrent(
        pending,
        pending,
        2_000,
      ),
    (error) =>
      error.status === 401 &&
      error.code === 'authentication_challenge_expired',
  );
});

test('origin retirement accepts only a current 0.2 client after local purge', () => {
  const retirement = {
    requiredDeviceIds: ['device-1', 'device-2'],
    retiredDeviceIds: [],
  };
  assert.throws(
    () =>
      assertOriginRetirementRevocation({
        retirement,
        currentDeviceId: 'device-1',
        targetDeviceId: 'device-2',
        clientVersion: '0.2.0',
        localPurgeCompleted: true,
      }),
    (error) => error.status === 409 && error.code === 'self_signout_required',
  );
  assert.throws(
    () =>
      assertOriginRetirementRevocation({
        retirement,
        currentDeviceId: 'device-1',
        targetDeviceId: 'device-1',
        clientVersion: '0.1.0',
        localPurgeCompleted: true,
      }),
    (error) =>
      error.status === 409 &&
      error.code === 'retirement_client_upgrade_required',
  );
  assert.doesNotThrow(() =>
    assertOriginRetirementRevocation({
      retirement,
      currentDeviceId: 'device-1',
      targetDeviceId: 'device-1',
      clientVersion: '0.2.0',
      localPurgeCompleted: true,
    }),
  );
});

test('device session requires its cookie and CSRF proof and starts locked', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conductor-pocket-security-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const rawSession = 'test-session-token-with-enough-entropy-for-fixture';
  config.devices = [
    {
      id: 'device-1',
      name: 'Test iPhone',
      tailscaleLogin: null,
      createdAt: '2026-01-01T00:00:00Z',
      lastSeenAt: '2026-01-01T00:00:00Z',
      sessionHash: sha256(rawSession),
      passkey: {
        id: 'credential-1',
        publicKey: 'AA',
        counter: 0,
        transports: ['internal'],
        backedUp: true,
      },
    },
  ];
  await saveConfig(configPath, config);
  const store = new ConfigStore(configPath, config);
  const security = new SecurityManager(store);
  const request = {
    headers: { cookie: `${SESSION_COOKIE}=${rawSession}` },
    socket: { remoteAddress: '127.0.0.1' },
  };

  const bootstrap = security.bootstrap(request);
  assert.equal(bootstrap.authenticated, true);
  assert.equal(bootstrap.unlocked, false);
  assert.match(bootstrap.csrfToken, /^[A-Za-z0-9_-]+$/);
  assert.throws(
    () => security.session(request, { requireUnlocked: true }),
    (error) => error.status === 423 && error.code === 'device_locked',
  );
  assert.throws(
    () => security.session(request, { requireCsrf: true }),
    (error) => error.status === 403 && error.code === 'csrf_denied',
  );

  request.headers['x-csrf-token'] = bootstrap.csrfToken;
  assert.equal(security.session(request, { requireCsrf: true }).device.id, 'device-1');
});

test('production identity is pinned to the paired Tailscale login', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conductor-pocket-tail-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const { config } = createConfig({
    publicOrigin: 'https://mac.example-tailnet.ts.net',
    developmentMode: false,
  });
  config.allowedTailscaleLogin = 'alex@example.com';
  await saveConfig(configPath, config);
  const security = new SecurityManager(new ConfigStore(configPath, config));

  assert.equal(
    security.assertTailscaleIdentity({
      headers: { 'tailscale-user-login': 'Alex@Example.com' },
    }),
    'alex@example.com',
  );
  assert.throws(
    () =>
      security.assertTailscaleIdentity({
        headers: { 'tailscale-user-login': 'other@example.com' },
      }),
    (error) => error.status === 403 && error.code === 'tailscale_identity_denied',
  );
});

test('trusted Tailnet access survives relay restarts without renewing its deadline', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const first = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
  });
  const initial = first.bootstrap(fixture.request);
  assert.equal(initial.unlocked, true);
  assert.equal(
    initial.reauthenticationMode,
    REAUTHENTICATION_MODE_TAILSCALE_SESSION,
  );

  const reloaded = await loadConfig(fixture.configPath);
  const restarted = new SecurityManager(
    new ConfigStore(fixture.configPath, reloaded),
    { now: () => now + 120_000 },
  );
  const afterRestart = restarted.bootstrap(fixture.request);
  assert.equal(afterRestart.unlocked, true);
  assert.equal(
    afterRestart.unlockedUntil,
    fixture.config.devices[0].trustedUntil,
  );
  assert.equal(
    (await loadConfig(fixture.configPath)).devices[0].trustedUntil,
    fixture.config.devices[0].trustedUntil,
  );
});

test('trusted Face ID atomically rotates the session token and CSRF proof', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
    verifyAuthentication: async () => ({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    }),
  });
  const bootstrap = security.bootstrap(fixture.request);
  fixture.request.headers['x-csrf-token'] = bootstrap.csrfToken;
  await security.authenticationOptions(fixture.request);

  const verified = await security.verifyAuthentication(
    fixture.request,
    { id: 'credential-1' },
  );
  const rotatedToken = new RegExp(
    `^${SESSION_COOKIE}=([^;]+);`,
  ).exec(verified.setCookie)?.[1];
  assert.ok(rotatedToken);
  assert.notEqual(rotatedToken, fixture.rawSession);
  assert.notEqual(verified.csrfToken, bootstrap.csrfToken);

  const stored = await loadConfig(fixture.configPath);
  assert.equal(
    stored.devices[0].sessionHash,
    sha256(rotatedToken),
  );
  assert.equal(
    stored.devices[0].previousSessionHash,
    sha256(fixture.rawSession),
  );
  assert.equal(
    stored.devices[0].previousSessionExpiresAt,
    new Date(
      now + 60_000 + SESSION_ROTATION_GRACE_MS,
    ).toISOString(),
  );
  assert.equal(stored.devices[0].lockGeneration, 2);

  const restarted = new SecurityManager(
    new ConfigStore(fixture.configPath, stored),
    { now: () => now + 120_000 },
  );
  const rotatedRequest = {
    ...fixture.request,
    headers: {
      ...fixture.request.headers,
      cookie: `${SESSION_COOKIE}=${rotatedToken}`,
    },
  };
  const rotatedBootstrap = restarted.bootstrap(rotatedRequest);
  assert.equal(rotatedBootstrap.unlocked, true);
  assert.equal(rotatedBootstrap.csrfToken, verified.csrfToken);
  const recoveryBootstrap = restarted.bootstrap(fixture.request);
  assert.equal(recoveryBootstrap.unlocked, false);
  assert.equal(recoveryBootstrap.sessionRotationRequired, true);
});

test('Lock now wins while a trusted Face ID verification is in flight', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  let releaseVerification;
  let verificationStarted;
  const started = new Promise((resolve) => {
    verificationStarted = resolve;
  });
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
    verifyAuthentication: async () => {
      verificationStarted();
      return new Promise((resolve) => {
        releaseVerification = resolve;
      });
    },
  });
  const bootstrap = security.bootstrap(fixture.request);
  fixture.request.headers['x-csrf-token'] = bootstrap.csrfToken;
  await security.authenticationOptions(fixture.request);
  const pendingVerification = security.verifyAuthentication(
    fixture.request,
    { id: 'credential-1' },
  );
  await started;

  await security.lock(fixture.request, { explicit: true });
  releaseVerification({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  });
  await assert.rejects(
    pendingVerification,
    (error) =>
      error.status === 409 &&
      error.code === 'authentication_state_changed',
  );
  const stored = await loadConfig(fixture.configPath);
  assert.equal(stored.devices[0].trustedUntil, null);
  assert.equal(stored.devices[0].lockGeneration, 2);
});

test('trusted Tailnet access still requires the exact cookie and pinned login', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
  });

  assert.throws(
    () =>
      security.bootstrap({
        ...fixture.request,
        headers: {
          ...fixture.request.headers,
          cookie: `${SESSION_COOKIE}=wrong-token`,
        },
      }),
    (error) => error.status === 401 && error.code === 'device_revoked',
  );
  assert.throws(
    () =>
      security.bootstrap({
        ...fixture.request,
        headers: {
          ...fixture.request.headers,
          'tailscale-user-login': 'other@example.com',
        },
      }),
    (error) =>
      error.status === 403 &&
      error.code === 'tailscale_identity_denied',
  );
});

test('manual trusted-device lock persists across relay restarts', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
  });
  const bootstrap = security.bootstrap(fixture.request);
  fixture.request.headers['x-csrf-token'] = bootstrap.csrfToken;

  assert.deepEqual(
    await security.lock(fixture.request, { explicit: true }),
    { locked: true },
  );
  const reloaded = await loadConfig(fixture.configPath);
  assert.equal(reloaded.devices[0].trustedUntil, null);
  assert.equal(
    reloaded.devices[0].lockedAt,
    new Date(now + 60_000).toISOString(),
  );
  assert.equal(reloaded.devices[0].lockGeneration, 2);
  const restarted = new SecurityManager(
    new ConfigStore(fixture.configPath, reloaded),
    { now: () => now + 120_000 },
  );
  assert.equal(restarted.bootstrap(fixture.request).unlocked, false);
  assert.throws(
    () =>
      restarted.session(fixture.request, {
        requireUnlocked: true,
      }),
    (error) => error.status === 423 && error.code === 'device_locked',
  );
});

test('legacy background lock is ignored only in trusted Tailnet mode', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
  });
  const bootstrap = security.bootstrap(fixture.request);
  fixture.request.headers['x-csrf-token'] = bootstrap.csrfToken;

  assert.deepEqual(await security.lock(fixture.request), {
    locked: false,
    ignored: true,
  });
  const reloaded = await loadConfig(fixture.configPath);
  assert.equal(reloaded.devices[0].lockedAt, null);
  assert.equal(
    new SecurityManager(
      new ConfigStore(fixture.configPath, reloaded),
      { now: () => now + 120_000 },
    ).bootstrap(fixture.request).unlocked,
    true,
  );
});

test('trusted device is rejected exactly at its server-side expiry', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const expiresAt = Date.parse(
    fixture.config.devices[0].sessionExpiresAt,
  );
  const security = new SecurityManager(fixture.store, {
    now: () => expiresAt,
  });

  assert.throws(
    () => security.bootstrap(fixture.request),
    (error) =>
      error.status === 401 &&
      error.code === 'device_session_expired',
  );
});

test('a lost rotated-cookie response gets a short Face ID-only recovery window', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const previousToken =
    'previous-session-token-with-enough-entropy-for-fixture';
  const previousExpiresAt =
    now + SESSION_ROTATION_GRACE_MS;
  fixture.config.devices[0].previousSessionHash =
    sha256(previousToken);
  fixture.config.devices[0].previousSessionExpiresAt =
    new Date(previousExpiresAt).toISOString();
  await saveConfig(fixture.configPath, fixture.config);
  const previousRequest = {
    ...fixture.request,
    headers: {
      ...fixture.request.headers,
      cookie: `${SESSION_COOKIE}=${previousToken}`,
    },
  };
  const recovering = new SecurityManager(
    new ConfigStore(fixture.configPath, fixture.config),
    { now: () => now + 60_000 },
  );

  const bootstrap = recovering.bootstrap(previousRequest);
  assert.equal(bootstrap.authenticated, true);
  assert.equal(bootstrap.unlocked, false);
  assert.equal(bootstrap.sessionRotationRequired, true);
  assert.match(bootstrap.csrfToken, /^[A-Za-z0-9_-]+$/);
  assert.throws(
    () =>
      recovering.session(previousRequest, {
        requireUnlocked: true,
      }),
    (error) => error.status === 423 && error.code === 'device_locked',
  );

  const expired = new SecurityManager(
    new ConfigStore(
      fixture.configPath,
      await loadConfig(fixture.configPath),
    ),
    { now: () => previousExpiresAt },
  );
  assert.throws(
    () => expired.bootstrap(previousRequest),
    (error) => error.status === 401 && error.code === 'device_revoked',
  );
});

test('revoking a trusted device immediately defeats its old cookie', async (context) => {
  const now = Date.parse('2026-07-27T20:00:00.000Z');
  const fixture = await trustedSecurityFixture(context, now);
  const security = new SecurityManager(fixture.store, {
    now: () => now + 60_000,
  });
  const bootstrap = security.bootstrap(fixture.request);
  fixture.request.headers['x-csrf-token'] = bootstrap.csrfToken;

  const revoked = await security.revokeDevice(
    fixture.request,
    'device-1',
  );
  assert.equal(revoked.revoked, true);
  assert.match(revoked.setCookie, /Max-Age=0/);
  const reloaded = await loadConfig(fixture.configPath);
  const restarted = new SecurityManager(
    new ConfigStore(fixture.configPath, reloaded),
    { now: () => now + 120_000 },
  );
  assert.throws(
    () => restarted.bootstrap(fixture.request),
    (error) => error.status === 401 && error.code === 'device_revoked',
  );
});
