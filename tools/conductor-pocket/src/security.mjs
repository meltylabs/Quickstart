import { createHmac, randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import {
  APP_VERSION,
  DEVICE_SESSION_TTL_SECONDS,
  PAIR_COOKIE,
  PAIR_SESSION_TTL_MS,
  REAUTHENTICATION_MODE_TAILSCALE_SESSION,
  SESSION_ROTATION_GRACE_MS,
  SESSION_COOKIE,
  TRUSTED_DEVICE_TTL_MS,
  UNLOCK_IDLE_TTL_MS,
  UNLOCK_TTL_MS,
} from './constants.mjs';
import { fromBase64Url, randomToken, safeEqual, sha256, toBase64Url } from './encoding.mjs';
import { HttpError } from './errors.mjs';

const TEXT_ENCODER = new TextEncoder();
const PAIR_ATTEMPT_WINDOW_MS = 60 * 1000;
const PAIR_ATTEMPT_LIMIT = 5;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function parseCookies(header = '') {
  const cookies = new Map();
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

function sessionCookie(name, value, { maxAge, clear = false } = {}) {
  const parts = [
    `${name}=${clear ? '' : value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${clear ? 0 : maxAge}`,
    'Priority=High',
  ];
  return parts.join('; ');
}

export function authenticationCookieRefresh(
  rawSessionToken,
  { trustedMode },
) {
  return trustedMode && rawSessionToken
    ? sessionCookie(SESSION_COOKIE, rawSessionToken, {
        maxAge: DEVICE_SESSION_TTL_SECONDS,
      })
    : null;
}

function normalizeDeviceName(value) {
  if (typeof value !== 'string') return 'iPhone';
  const name = value.trim().replace(/\s+/g, ' ');
  return name.slice(0, 80) || 'iPhone';
}

function tailscaleLogin(request) {
  const value = request.headers['tailscale-user-login'];
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function getRequestKey(request) {
  return tailscaleLogin(request) || request.socket?.remoteAddress || 'unknown';
}

export function createUnlockWindow(now) {
  return {
    absoluteUntil: now + UNLOCK_TTL_MS,
    idleUntil: now + UNLOCK_IDLE_TTL_MS,
  };
}

export function evaluateUnlockWindow(window, now, { touch = false } = {}) {
  if (
    !window ||
    !Number.isFinite(window.absoluteUntil) ||
    !Number.isFinite(window.idleUntil) ||
    window.absoluteUntil <= now ||
    window.idleUntil <= now
  ) {
    return { unlocked: false, unlockedUntil: 0 };
  }
  if (touch) {
    window.idleUntil = Math.min(
      window.absoluteUntil,
      now + UNLOCK_IDLE_TTL_MS,
    );
  }
  return {
    unlocked: true,
    unlockedUntil: Math.min(window.absoluteUntil, window.idleUntil),
  };
}

export function evaluateTrustedDeviceSession(device, now) {
  const sessionExpiresAt = Date.parse(device?.sessionExpiresAt);
  if (!Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= now) {
    return {
      sessionValid: false,
      unlocked: false,
      unlockedUntil: 0,
    };
  }
  const trustedUntil = Date.parse(device?.trustedUntil);
  const lockedAt = Date.parse(device?.lockedAt);
  if (
    Number.isFinite(lockedAt) ||
    !Number.isFinite(trustedUntil) ||
    trustedUntil <= now
  ) {
    return {
      sessionValid: true,
      unlocked: false,
      unlockedUntil: 0,
    };
  }
  return {
    sessionValid: true,
    unlocked: true,
    unlockedUntil: Math.min(sessionExpiresAt, trustedUntil),
  };
}

export function assertAuthenticationGeneration(
  device,
  expectedLockGeneration,
) {
  if (device.lockGeneration !== expectedLockGeneration) {
    throw new HttpError(409, 'authentication_state_changed');
  }
}

export function assertAuthenticationChallengeCurrent(
  current,
  expected,
  now,
) {
  if (current !== expected) {
    throw new HttpError(409, 'authentication_state_changed');
  }
  if (expected.expiresAt <= now) {
    throw new HttpError(401, 'authentication_challenge_expired');
  }
}

function trustedDeviceDeadlines(now) {
  const sessionExpiresAt =
    now + DEVICE_SESSION_TTL_SECONDS * 1000;
  return {
    sessionExpiresAt,
    trustedUntil: Math.min(
      sessionExpiresAt,
      now + TRUSTED_DEVICE_TTL_MS,
    ),
  };
}

export function assertOriginRetirementRevocation({
  retirement,
  currentDeviceId,
  targetDeviceId,
  clientVersion,
  localPurgeCompleted,
}) {
  if (!retirement) return;
  if (currentDeviceId !== targetDeviceId) {
    throw new HttpError(409, 'self_signout_required');
  }
  if (
    clientVersion !== APP_VERSION ||
    localPurgeCompleted !== true
  ) {
    throw new HttpError(409, 'retirement_client_upgrade_required');
  }
}

export class SecurityManager {
  #store;
  #now;
  #pendingPairs = new Map();
  #challenges = new Map();
  #unlocks = new Map();
  #pairAttempts = new Map();
  #verifyAuthenticationResponse;

  constructor(
    configStore,
    {
      now = () => Date.now(),
      verifyAuthentication =
        verifyAuthenticationResponse,
    } = {},
  ) {
    this.#store = configStore;
    this.#now = now;
    this.#verifyAuthenticationResponse = verifyAuthentication;
  }

  get config() {
    return this.#store.value;
  }

  assertTailscaleIdentity(request, { capture = false } = {}) {
    const config = this.config;
    if (!config.requireTailscaleIdentity) return null;
    const login = tailscaleLogin(request);
    if (!login) {
      throw new HttpError(403, 'tailscale_identity_required');
    }
    if (
      config.allowedTailscaleLogin &&
      !safeEqual(login, config.allowedTailscaleLogin.toLowerCase())
    ) {
      throw new HttpError(403, 'tailscale_identity_denied');
    }
    if (!capture && !config.allowedTailscaleLogin) {
      throw new HttpError(403, 'tailscale_identity_unpaired');
    }
    return login;
  }

  assertOrigin(request) {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !safeEqual(origin, this.config.publicOrigin)) {
      throw new HttpError(403, 'origin_denied');
    }
  }

  async startPairing(request, { code, deviceName }) {
    this.assertOrigin(request);
    const login = this.assertTailscaleIdentity(request, { capture: true });
    this.#rateLimitPairing(getRequestKey(request));
    const pairing = this.config.pairing;
    if (!pairing) throw new HttpError(410, 'pairing_unavailable');
    const expiresAt = Date.parse(pairing.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) {
      throw new HttpError(410, 'pairing_expired');
    }
    if (typeof code !== 'string' || !safeEqual(sha256(code), pairing.codeHash)) {
      throw new HttpError(401, 'pairing_code_invalid');
    }

    const deviceId = randomUUID();
    const pairToken = randomToken(32);
    const options = await generateRegistrationOptions({
      rpName: this.config.appName,
      rpID: this.config.rpId,
      userID: TEXT_ENCODER.encode(deviceId),
      userName: normalizeDeviceName(deviceName),
      userDisplayName: normalizeDeviceName(deviceName),
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      supportedAlgorithmIDs: [-7, -257],
      timeout: 60_000,
    });

    this.#pendingPairs.set(sha256(pairToken), {
      deviceId,
      deviceName: normalizeDeviceName(deviceName),
      tailscaleLogin: login,
      challenge: options.challenge,
      pairingHash: pairing.codeHash,
      expiresAt: this.#now() + PAIR_SESSION_TTL_MS,
    });
    return {
      options,
      setCookie: sessionCookie(PAIR_COOKIE, pairToken, {
        maxAge: Math.floor(PAIR_SESSION_TTL_MS / 1000),
      }),
    };
  }

  async finishPairing(request, response) {
    this.assertOrigin(request);
    const login = this.assertTailscaleIdentity(request, { capture: true });
    const cookies = parseCookies(request.headers.cookie);
    const pairToken = cookies.get(PAIR_COOKIE);
    const pendingKey = pairToken ? sha256(pairToken) : null;
    const pending = pendingKey ? this.#pendingPairs.get(pendingKey) : null;
    if (!pending || pending.expiresAt <= this.#now()) {
      if (pendingKey) this.#pendingPairs.delete(pendingKey);
      throw new HttpError(401, 'pairing_session_expired');
    }
    if (pending.tailscaleLogin !== login) {
      throw new HttpError(403, 'pairing_identity_changed');
    }
    if (
      !this.config.pairing ||
      !safeEqual(this.config.pairing.codeHash, pending.pairingHash)
    ) {
      throw new HttpError(410, 'pairing_rotated');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.config.publicOrigin,
        expectedRPID: this.config.rpId,
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(401, 'passkey_registration_failed');
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpError(401, 'passkey_registration_failed');
    }

    const { credential, credentialBackedUp, credentialDeviceType } =
      verification.registrationInfo;
    const rawSessionToken = randomToken(32);
    const sessionHash = sha256(rawSessionToken);
    const nowMs = this.#now();
    const now = new Date(nowMs).toISOString();
    const trustedMode =
      this.config.reauthenticationMode ===
      REAUTHENTICATION_MODE_TAILSCALE_SESSION;
    const trustedDeadlines = trustedMode
      ? trustedDeviceDeadlines(nowMs)
      : null;
    const device = {
      id: pending.deviceId,
      name: pending.deviceName,
      tailscaleLogin: login,
      createdAt: now,
      lastSeenAt: now,
      sessionHash,
      previousSessionHash: null,
      previousSessionExpiresAt: null,
      sessionExpiresAt: trustedDeadlines
        ? new Date(trustedDeadlines.sessionExpiresAt).toISOString()
        : null,
      trustedUntil: trustedDeadlines
        ? new Date(trustedDeadlines.trustedUntil).toISOString()
        : null,
      lockedAt: null,
      lockGeneration: 0,
      passkey: {
        id: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: response?.response?.transports || credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
    };

    await this.#store.update((config) => {
      if (
        !config.pairing ||
        !safeEqual(config.pairing.codeHash, pending.pairingHash)
      ) {
        throw new HttpError(410, 'pairing_rotated');
      }
      if (
        config.allowedTailscaleLogin &&
        config.allowedTailscaleLogin.toLowerCase() !== login
      ) {
        throw new HttpError(403, 'tailscale_identity_denied');
      }
      config.allowedTailscaleLogin = config.allowedTailscaleLogin || login;
      config.pairing = null;
      config.devices.push(device);
      return config;
    });

    this.#pendingPairs.delete(pendingKey);
    const unlock = createUnlockWindow(nowMs);
    this.#unlocks.set(sessionHash, unlock);
    return {
      device: this.#publicDevice(device),
      csrfToken: this.#csrfToken(device),
      reauthenticationMode: this.config.reauthenticationMode,
      unlockedUntil: trustedDeadlines
        ? new Date(trustedDeadlines.trustedUntil).toISOString()
        : new Date(unlock.idleUntil).toISOString(),
      setCookies: [
        sessionCookie(SESSION_COOKIE, rawSessionToken, {
          maxAge: DEVICE_SESSION_TTL_SECONDS,
        }),
        sessionCookie(PAIR_COOKIE, '', { maxAge: 0, clear: true }),
      ],
    };
  }

  session(
    request,
    { requireUnlocked = false, requireCsrf = false, touch = true } = {},
  ) {
    this.assertTailscaleIdentity(request);
    const cookies = parseCookies(request.headers.cookie);
    const token = cookies.get(SESSION_COOKIE);
    if (!token) throw new HttpError(401, 'authentication_required');
    const sessionHash = sha256(token);
    let device = this.config.devices.find((candidate) =>
      safeEqual(candidate.sessionHash, sessionHash),
    );
    let sessionRotationRequired = false;
    if (
      !device &&
      this.config.reauthenticationMode ===
        REAUTHENTICATION_MODE_TAILSCALE_SESSION
    ) {
      const now = this.#now();
      device = this.config.devices.find(
        (candidate) =>
          typeof candidate.previousSessionHash === 'string' &&
          safeEqual(candidate.previousSessionHash, sessionHash) &&
          Date.parse(candidate.previousSessionExpiresAt) > now,
      );
      sessionRotationRequired = Boolean(device);
    }
    if (!device) throw new HttpError(401, 'device_revoked');
    const requestLogin = tailscaleLogin(request);
    if (
      this.config.requireTailscaleIdentity &&
      (!requestLogin || device.tailscaleLogin !== requestLogin)
    ) {
      throw new HttpError(403, 'device_identity_mismatch');
    }
    const csrfToken = this.#csrfToken(device, sessionHash);
    if (
      requireCsrf &&
      (typeof request.headers['x-csrf-token'] !== 'string' ||
        !safeEqual(request.headers['x-csrf-token'], csrfToken))
    ) {
      throw new HttpError(403, 'csrf_denied');
    }
    let unlock;
    if (
      this.config.reauthenticationMode ===
      REAUTHENTICATION_MODE_TAILSCALE_SESSION
    ) {
      unlock = evaluateTrustedDeviceSession(device, this.#now());
      if (!unlock.sessionValid) {
        throw new HttpError(401, 'device_session_expired');
      }
      if (sessionRotationRequired) {
        unlock = {
          sessionValid: true,
          unlocked: false,
          unlockedUntil: 0,
        };
      }
    } else {
      const unlockWindow = this.#unlocks.get(device.sessionHash);
      unlock = evaluateUnlockWindow(unlockWindow, this.#now(), { touch });
      if (!unlock.unlocked && unlockWindow) {
        this.#unlocks.delete(device.sessionHash);
      }
    }
    if (requireUnlocked && !unlock.unlocked) {
      throw new HttpError(423, 'device_locked');
    }
    return {
      device,
      sessionHash,
      sessionRotationRequired,
      csrfToken,
      unlocked: unlock.unlocked,
      unlockedUntil: unlock.unlocked
        ? new Date(unlock.unlockedUntil).toISOString()
        : null,
    };
  }

  bootstrap(request) {
    const session = this.session(request);
    return {
      authenticated: true,
      unlocked: session.unlocked,
      unlockedUntil: session.unlockedUntil,
      reauthenticationMode: this.config.reauthenticationMode,
      sessionRotationRequired: session.sessionRotationRequired,
      csrfToken: session.csrfToken,
      device: this.#publicDevice(session.device),
    };
  }

  async authenticationOptions(request) {
    this.assertOrigin(request);
    const { device, sessionHash } = this.session(request, {
      requireCsrf: true,
    });
    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      allowCredentials: [
        {
          id: device.passkey.id,
          transports: device.passkey.transports || [],
        },
      ],
      userVerification: 'required',
      timeout: 60_000,
    });
    this.#challenges.set(sessionHash, {
      challenge: options.challenge,
      expiresAt: this.#now() + CHALLENGE_TTL_MS,
      lockGeneration: device.lockGeneration,
    });
    return options;
  }

  async verifyAuthentication(request, response) {
    this.assertOrigin(request);
    const {
      device,
      sessionHash,
      csrfToken,
    } = this.session(request, { requireCsrf: true });
    const pending = this.#challenges.get(sessionHash);
    if (!pending || pending.expiresAt <= this.#now()) {
      this.#challenges.delete(sessionHash);
      throw new HttpError(401, 'authentication_challenge_expired');
    }
    let verification;
    try {
      verification = await this.#verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: this.config.publicOrigin,
        expectedRPID: this.config.rpId,
        credential: {
          id: device.passkey.id,
          publicKey: fromBase64Url(device.passkey.publicKey),
          counter: device.passkey.counter,
          transports: device.passkey.transports || [],
        },
        requireUserVerification: true,
      });
    } catch {
      throw new HttpError(401, 'passkey_authentication_failed');
    }
    if (!verification.verified) {
      throw new HttpError(401, 'passkey_authentication_failed');
    }
    try {
      assertAuthenticationChallengeCurrent(
        this.#challenges.get(sessionHash),
        pending,
        this.#now(),
      );
    } catch (error) {
      if (this.#challenges.get(sessionHash) === pending) {
        this.#challenges.delete(sessionHash);
      }
      throw error;
    }
    this.#challenges.delete(sessionHash);
    const now = this.#now();
    const trustedMode =
      this.config.reauthenticationMode ===
      REAUTHENTICATION_MODE_TAILSCALE_SESSION;
    const trustedDeadlines = trustedMode
      ? trustedDeviceDeadlines(now)
      : null;
    const nextSessionToken = trustedMode ? randomToken(32) : null;
    const nextSessionHash = nextSessionToken
      ? sha256(nextSessionToken)
      : null;
    const unlock = createUnlockWindow(now);
    if (!trustedMode) {
      this.#unlocks.set(device.sessionHash, unlock);
    } else {
      this.#unlocks.delete(sessionHash);
    }
    const updatedConfig = await this.#store.update((config) => {
      const stored = config.devices.find((candidate) => candidate.id === device.id);
      if (!stored) throw new HttpError(401, 'device_revoked');
      if (trustedMode) {
        assertAuthenticationGeneration(
          stored,
          pending.lockGeneration,
        );
      }
      stored.passkey.counter = verification.authenticationInfo.newCounter;
      stored.lastSeenAt = new Date(now).toISOString();
      if (trustedDeadlines) {
        stored.previousSessionHash = sessionHash;
        stored.previousSessionExpiresAt = new Date(
          now + SESSION_ROTATION_GRACE_MS,
        ).toISOString();
        stored.sessionHash = nextSessionHash;
        stored.sessionExpiresAt = new Date(
          trustedDeadlines.sessionExpiresAt,
        ).toISOString();
        stored.trustedUntil = new Date(
          trustedDeadlines.trustedUntil,
        ).toISOString();
        stored.lockedAt = null;
        stored.lockGeneration += 1;
      }
      return config;
    });
    const updatedDevice = updatedConfig.devices.find(
      (candidate) => candidate.id === device.id,
    );
    if (!updatedDevice) throw new HttpError(401, 'device_revoked');
    return {
      unlocked: true,
      unlockedUntil: new Date(
        trustedDeadlines
          ? trustedDeadlines.trustedUntil
          : unlock.idleUntil,
      ).toISOString(),
      reauthenticationMode: this.config.reauthenticationMode,
      csrfToken: trustedMode
        ? this.#csrfToken(updatedDevice)
        : csrfToken,
      setCookie: authenticationCookieRefresh(
        nextSessionToken,
        { trustedMode },
      ),
    };
  }

  touch(request) {
    this.assertOrigin(request);
    const session = this.session(request, {
      requireUnlocked: true,
      requireCsrf: true,
      touch: true,
    });
    return {
      unlocked: true,
      unlockedUntil: session.unlockedUntil,
    };
  }

  async lock(request, { explicit = false } = {}) {
    this.assertOrigin(request);
    const { device, sessionHash } = this.session(request, {
      requireCsrf: true,
    });
    if (
      this.config.reauthenticationMode ===
      REAUTHENTICATION_MODE_TAILSCALE_SESSION
    ) {
      if (!explicit) {
        return { locked: false, ignored: true };
      }
      this.#challenges.delete(sessionHash);
      this.#challenges.delete(device.sessionHash);
      const lockedAt = new Date(this.#now()).toISOString();
      await this.#store.update((config) => {
        const stored = config.devices.find(
          (candidate) => candidate.id === device.id,
        );
        if (!stored) throw new HttpError(401, 'device_revoked');
        stored.lockedAt = lockedAt;
        stored.trustedUntil = null;
        stored.lockGeneration += 1;
        return config;
      });
    }
    this.#challenges.delete(sessionHash);
    this.#challenges.delete(device.sessionHash);
    this.#unlocks.delete(device.sessionHash);
    return { locked: true };
  }

  listDevices(request) {
    this.session(request, { requireUnlocked: true });
    return this.config.devices.map((device) => this.#publicDevice(device));
  }

  async revokeDevice(request, deviceId, retirementProof = {}) {
    this.assertOrigin(request);
    const current = this.session(request, {
      requireUnlocked: true,
      requireCsrf: true,
    });
    const target = this.config.devices.find((device) => device.id === deviceId);
    if (!target) throw new HttpError(404, 'device_not_found');
    assertOriginRetirementRevocation({
      retirement: this.config.originRetirement,
      currentDeviceId: current.device.id,
      targetDeviceId: deviceId,
      clientVersion: retirementProof.clientVersion,
      localPurgeCompleted: retirementProof.localPurgeCompleted,
    });
    await this.#store.update((config) => {
      config.devices = config.devices.filter((device) => device.id !== deviceId);
      if (
        config.originRetirement &&
        config.originRetirement.requiredDeviceIds.includes(deviceId) &&
        !config.originRetirement.retiredDeviceIds.includes(deviceId)
      ) {
        config.originRetirement.retiredDeviceIds.push(deviceId);
      }
      return config;
    });
    this.#unlocks.delete(target.sessionHash);
    return {
      revoked: true,
      currentDevice: current.device.id === deviceId,
      setCookie:
        current.device.id === deviceId
          ? sessionCookie(SESSION_COOKIE, '', { maxAge: 0, clear: true })
          : null,
    };
  }

  #publicDevice(device) {
    return {
      id: device.id,
      name: device.name,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      sessionExpiresAt: device.sessionExpiresAt || null,
      tailscaleLogin: device.tailscaleLogin,
      passkeyBackedUp: Boolean(device.passkey?.backedUp),
    };
  }

  #csrfToken(device, sessionHash = device.sessionHash) {
    return createHmac('sha256', this.config.csrfSecret)
      .update(`csrf:${device.id}:${sessionHash}`)
      .digest('base64url');
  }

  #rateLimitPairing(key) {
    const now = this.#now();
    const prior = this.#pairAttempts.get(key) || [];
    const current = prior.filter((timestamp) => timestamp > now - PAIR_ATTEMPT_WINDOW_MS);
    if (current.length >= PAIR_ATTEMPT_LIMIT) {
      throw new HttpError(429, 'pairing_rate_limited');
    }
    current.push(now);
    this.#pairAttempts.set(key, current);
  }
}
