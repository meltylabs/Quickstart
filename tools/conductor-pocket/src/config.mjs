import fs from 'node:fs/promises';
import path from 'node:path';
import { randomToken, sha256 } from './encoding.mjs';
import {
  APP_NAME,
  DEFAULT_CONFIG_PATH,
  DEFAULT_DB_PATH,
  DEFAULT_PORT,
  DEVICE_SESSION_TTL_SECONDS,
  LOOPBACK_HOST,
  PAIRING_TTL_MS,
  REAUTHENTICATION_MODE_FACE_ID,
  REAUTHENTICATION_MODE_TAILSCALE_SESSION,
} from './constants.mjs';
import { withOperationLock } from './operation-lock.mjs';

const ADMINISTRATIVE_RETIREMENT_BASIS =
  'user_reported_ios_home_screen_app_deleted';
const ADMINISTRATIVE_RECEIPT_STATUS = 'missing';
const ADMINISTRATIVE_LOCAL_PURGE_STATUS = 'unverified';

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function parsePublicOrigin(value, allowInsecureLocalhost = false) {
  const url = new URL(value);
  const isLocal =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(allowInsecureLocalhost && isLocal && url.protocol === 'http:')) {
    throw new Error('publicOrigin must use HTTPS');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('publicOrigin must not include a path, query, or fragment');
  }
  return url.origin;
}

function nonemptyString(value, label, maximumLength = 512) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function validateAdministrativeAttestations(raw, requiredDeviceIds, label) {
  const rawAttestations = raw ?? [];
  if (!Array.isArray(rawAttestations)) {
    throw new Error(`${label} must be an array`);
  }
  const seen = new Set();
  return rawAttestations.map((rawAttestation, index) => {
    const itemLabel = `${label}[${index}]`;
    assertObject(rawAttestation, itemLabel);
    const deviceId = nonemptyString(
      rawAttestation.deviceId,
      `${itemLabel}.deviceId`,
    );
    if (!requiredDeviceIds.includes(deviceId) || seen.has(deviceId)) {
      throw new Error(`${label} contains an invalid or duplicate device id`);
    }
    seen.add(deviceId);
    if (rawAttestation.basis !== ADMINISTRATIVE_RETIREMENT_BASIS) {
      throw new Error(`${itemLabel}.basis is invalid`);
    }
    if (rawAttestation.receiptStatus !== ADMINISTRATIVE_RECEIPT_STATUS) {
      throw new Error(`${itemLabel}.receiptStatus is invalid`);
    }
    if (
      rawAttestation.localPurgeStatus !==
      ADMINISTRATIVE_LOCAL_PURGE_STATUS
    ) {
      throw new Error(`${itemLabel}.localPurgeStatus is invalid`);
    }
    const sourceConfigRevision = nonemptyString(
      rawAttestation.sourceConfigRevision,
      `${itemLabel}.sourceConfigRevision`,
      128,
    );
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(sourceConfigRevision)) {
      throw new Error(`${itemLabel}.sourceConfigRevision is invalid`);
    }
    if (
      !Number.isSafeInteger(rawAttestation.operatorUid) ||
      rawAttestation.operatorUid < 0
    ) {
      throw new Error(`${itemLabel}.operatorUid is invalid`);
    }
    const attestedAt = optionalTimestamp(
      rawAttestation.attestedAt,
      `${itemLabel}.attestedAt`,
    );
    if (!attestedAt) {
      throw new Error(`${itemLabel}.attestedAt is invalid`);
    }
    return {
      deviceId,
      basis: ADMINISTRATIVE_RETIREMENT_BASIS,
      receiptStatus: ADMINISTRATIVE_RECEIPT_STATUS,
      localPurgeStatus: ADMINISTRATIVE_LOCAL_PURGE_STATUS,
      attestedAt,
      sourceConfigRevision,
      operatorUid: rawAttestation.operatorUid,
      operatorUsername: nonemptyString(
        rawAttestation.operatorUsername,
        `${itemLabel}.operatorUsername`,
        256,
      ),
      operatorHost: nonemptyString(
        rawAttestation.operatorHost,
        `${itemLabel}.operatorHost`,
        256,
      ),
    };
  });
}

function validateRetirementRecord(
  raw,
  { label, activePublicOrigin = null, completed = false },
) {
  if (raw == null) return null;
  assertObject(raw, label);
  const sourceOrigin = parsePublicOrigin(raw.sourceOrigin);
  if (activePublicOrigin && sourceOrigin !== activePublicOrigin) {
    throw new Error('originRetirement must belong to the current publicOrigin');
  }
  if (!Array.isArray(raw.requiredDeviceIds) || !Array.isArray(raw.retiredDeviceIds)) {
    throw new Error(`${label} device lists are invalid`);
  }
  const requiredDeviceIds = [...new Set(raw.requiredDeviceIds)];
  const retiredDeviceIds = [...new Set(raw.retiredDeviceIds)];
  if (
    requiredDeviceIds.some((id) => typeof id !== 'string' || !id) ||
    retiredDeviceIds.some(
      (id) => typeof id !== 'string' || !requiredDeviceIds.includes(id),
    )
  ) {
    throw new Error(`${label} contains an invalid device id`);
  }
  const administrativeAttestations = validateAdministrativeAttestations(
    raw.administrativeAttestations,
    requiredDeviceIds,
    `${label}.administrativeAttestations`,
  );
  const administrativelyRetired = new Set(
    administrativeAttestations.map((attestation) => attestation.deviceId),
  );
  if (retiredDeviceIds.some((id) => administrativelyRetired.has(id))) {
    throw new Error(
      `${label} cannot record both a self-purge receipt and an administrative attestation for one device`,
    );
  }
  if (
    typeof raw.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.startedAt))
  ) {
    throw new Error(`${label}.startedAt is invalid`);
  }
  const completedAt = completed
    ? optionalTimestamp(raw.completedAt, `${label}.completedAt`)
    : null;
  if (completed && !completedAt) {
    throw new Error(`${label}.completedAt is invalid`);
  }
  if (
    completed &&
    requiredDeviceIds.some(
      (id) =>
        !retiredDeviceIds.includes(id) && !administrativelyRetired.has(id),
    )
  ) {
    throw new Error(`${label} is missing retirement evidence`);
  }
  return {
    sourceOrigin,
    requiredDeviceIds,
    retiredDeviceIds,
    administrativeAttestations,
    startedAt: new Date(raw.startedAt).toISOString(),
    ...(completed ? { completedAt } : {}),
  };
}

function validateOriginRetirement(raw, publicOrigin) {
  return validateRetirementRecord(raw, {
    label: 'originRetirement',
    activePublicOrigin: publicOrigin,
  });
}

function validateCompletedOriginRetirements(raw) {
  const records = raw ?? [];
  if (!Array.isArray(records)) {
    throw new Error('completedOriginRetirements must be an array');
  }
  const seenOrigins = new Set();
  return records.map((record, index) => {
    const validated = validateRetirementRecord(record, {
      label: `completedOriginRetirements[${index}]`,
      completed: true,
    });
    if (seenOrigins.has(validated.sourceOrigin)) {
      throw new Error(
        'completedOriginRetirements contains a duplicate source origin',
      );
    }
    seenOrigins.add(validated.sourceOrigin);
    return validated;
  });
}

function optionalTimestamp(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} is invalid`);
  }
  return new Date(value).toISOString();
}

function validateDevices(rawDevices) {
  if (!Array.isArray(rawDevices)) throw new Error('devices must be an array');
  return rawDevices.map((rawDevice, index) => {
    assertObject(rawDevice, `devices[${index}]`);
    const lockGeneration = rawDevice.lockGeneration ?? 0;
    if (
      !Number.isSafeInteger(lockGeneration) ||
      lockGeneration < 0
    ) {
      throw new Error(
        `devices[${index}].lockGeneration is invalid`,
      );
    }
    return {
      ...rawDevice,
      lockGeneration,
      previousSessionHash:
        typeof rawDevice.previousSessionHash === 'string' &&
        rawDevice.previousSessionHash
          ? rawDevice.previousSessionHash
          : null,
      previousSessionExpiresAt: optionalTimestamp(
        rawDevice.previousSessionExpiresAt,
        `devices[${index}].previousSessionExpiresAt`,
      ),
      sessionExpiresAt: optionalTimestamp(
        rawDevice.sessionExpiresAt,
        `devices[${index}].sessionExpiresAt`,
      ),
      trustedUntil: optionalTimestamp(
        rawDevice.trustedUntil,
        `devices[${index}].trustedUntil`,
      ),
      lockedAt: optionalTimestamp(
        rawDevice.lockedAt,
        `devices[${index}].lockedAt`,
      ),
    };
  });
}

export function validateConfig(raw) {
  assertObject(raw, 'config');
  if (raw.version !== 1) throw new Error('Unsupported config version');
  if (raw.bindHost !== LOOPBACK_HOST) {
    throw new Error(`bindHost must be ${LOOPBACK_HOST}; LAN/public binding is forbidden`);
  }
  if (!Number.isInteger(raw.port) || raw.port < 1024 || raw.port > 65535) {
    throw new Error('port must be an integer from 1024 through 65535');
  }
  const publicOrigin = parsePublicOrigin(raw.publicOrigin, raw.developmentMode === true);
  const originHostname = new URL(publicOrigin).hostname;
  if (raw.rpId !== originHostname) {
    throw new Error('rpId must exactly match the publicOrigin hostname');
  }
  if (typeof raw.csrfSecret !== 'string' || raw.csrfSecret.length < 32) {
    throw new Error('csrfSecret is missing or too short');
  }
  if (typeof raw.dbPath !== 'string' || !path.isAbsolute(raw.dbPath)) {
    throw new Error('dbPath must be absolute');
  }
  if (typeof raw.requireTailscaleIdentity !== 'boolean') {
    throw new Error('requireTailscaleIdentity must be boolean');
  }
  const reauthenticationMode =
    raw.reauthenticationMode || REAUTHENTICATION_MODE_FACE_ID;
  const allowedTailscaleLogin = raw.allowedTailscaleLogin || null;
  if (
    reauthenticationMode !== REAUTHENTICATION_MODE_FACE_ID &&
    reauthenticationMode !== REAUTHENTICATION_MODE_TAILSCALE_SESSION
  ) {
    throw new Error('reauthenticationMode is invalid');
  }
  if (
    reauthenticationMode === REAUTHENTICATION_MODE_TAILSCALE_SESSION &&
    !raw.requireTailscaleIdentity
  ) {
    throw new Error(
      'tailscale-session requires mandatory Tailscale identity',
    );
  }
  const devices = validateDevices(raw.devices);
  if (
    devices.some(
      (device) =>
        Boolean(device.previousSessionHash) !==
        Boolean(device.previousSessionExpiresAt),
    )
  ) {
    throw new Error(
      'previous device session hash and expiry must be stored together',
    );
  }
  if (
    reauthenticationMode === REAUTHENTICATION_MODE_TAILSCALE_SESSION &&
    (!allowedTailscaleLogin ||
      devices.some(
        (device) =>
          !device.sessionExpiresAt ||
          typeof device.tailscaleLogin !== 'string' ||
          device.tailscaleLogin.toLowerCase() !==
            allowedTailscaleLogin.toLowerCase(),
      ))
  ) {
    throw new Error(
      'tailscale-session requires a pinned identity and server-side device expiry',
    );
  }
  const originRetirement = validateOriginRetirement(
    raw.originRetirement,
    publicOrigin,
  );
  const completedOriginRetirements = validateCompletedOriginRetirements(
    raw.completedOriginRetirements,
  );
  return {
    ...raw,
    publicOrigin,
    devices,
    reauthenticationMode,
    allowedTailscaleLogin,
    pairing: raw.pairing || null,
    originRetirement,
    completedOriginRetirements,
  };
}

export async function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = JSON.parse(await fs.readFile(configPath, 'utf8'));
  return validateConfig(raw);
}

export async function saveConfig(configPath, config) {
  const validated = validateConfig(config);
  const directory = path.dirname(configPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const temporaryPath = path.join(
    directory,
    `.config.${process.pid}.${randomToken(8)}.tmp`,
  );
  await fs.writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  await fs.rename(temporaryPath, configPath);
  await fs.chmod(configPath, 0o600);
}

export function createConfig({
  publicOrigin,
  dbPath = DEFAULT_DB_PATH,
  port = DEFAULT_PORT,
  developmentMode = false,
  requireTailscaleIdentity = !developmentMode,
  now = Date.now(),
} = {}) {
  const origin = parsePublicOrigin(publicOrigin, developmentMode);
  const pairingCode = randomToken(24);
  const config = validateConfig({
    version: 1,
    appName: APP_NAME,
    bindHost: LOOPBACK_HOST,
    port,
    publicOrigin: origin,
    rpId: new URL(origin).hostname,
    dbPath,
    developmentMode,
    requireTailscaleIdentity,
    reauthenticationMode: REAUTHENTICATION_MODE_FACE_ID,
    allowedTailscaleLogin: null,
    csrfSecret: randomToken(32),
    originRetirement: null,
    completedOriginRetirements: [],
    pairing: {
      codeHash: sha256(pairingCode),
      expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
    },
    devices: [],
  });
  return { config, pairingCode };
}

export function setReauthenticationMode(
  config,
  mode,
  now = Date.now(),
) {
  const validated = validateConfig(config);
  if (validated.reauthenticationMode === mode) {
    return validated;
  }
  if (mode === REAUTHENTICATION_MODE_FACE_ID) {
    return validateConfig({
      ...validated,
      reauthenticationMode: REAUTHENTICATION_MODE_FACE_ID,
    });
  }
  if (mode !== REAUTHENTICATION_MODE_TAILSCALE_SESSION) {
    throw new Error('reauthenticationMode is invalid');
  }
  if (
    !validated.requireTailscaleIdentity ||
    !validated.allowedTailscaleLogin ||
    validated.devices.length === 0
  ) {
    throw new Error(
      'tailscale-session requires a paired, pinned Tailscale identity',
    );
  }
  const lockedAt = new Date(now).toISOString();
  const sessionExpiresAt = new Date(
    now + DEVICE_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  return validateConfig({
    ...validated,
    reauthenticationMode: REAUTHENTICATION_MODE_TAILSCALE_SESSION,
    devices: validated.devices.map((device) => ({
      ...device,
      sessionExpiresAt,
      trustedUntil: null,
      lockedAt,
      lockGeneration: device.lockGeneration + 1,
      previousSessionHash: null,
      previousSessionExpiresAt: null,
    })),
  });
}

export function rotatePairing(config, now = Date.now()) {
  const validated = validateConfig(config);
  if (validated.originRetirement) {
    throw new Error(
      'Pairing stays disabled until the old-origin retirement is complete',
    );
  }
  const pairingCode = randomToken(24);
  return {
    pairingCode,
    config: validateConfig({
      ...validated,
      pairing: {
        codeHash: sha256(pairingCode),
        expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
      },
    }),
  };
}

export function beginOriginRetirement(config, now = Date.now()) {
  const validated = validateConfig(config);
  if (validated.originRetirement) return validated;
  return validateConfig({
    ...validated,
    pairing: null,
    originRetirement: {
      sourceOrigin: validated.publicOrigin,
      requiredDeviceIds: validated.devices.map((device) => device.id),
      retiredDeviceIds: [],
      administrativeAttestations: [],
      startedAt: new Date(now).toISOString(),
    },
  });
}

export function administrativelyRetireDeletedDevice(
  config,
  {
    deviceId,
    expectedOrigin,
    expectedRevision,
    operatorUid,
    operatorUsername,
    operatorHost,
    now = Date.now(),
  } = {},
) {
  const validated = validateConfig(config);
  const retirement = validated.originRetirement;
  if (!retirement) {
    throw new Error('Origin retirement is not armed');
  }
  const normalizedExpectedOrigin = parsePublicOrigin(
    nonemptyString(expectedOrigin, 'expectedOrigin'),
  );
  if (
    normalizedExpectedOrigin !== validated.publicOrigin ||
    normalizedExpectedOrigin !== retirement.sourceOrigin
  ) {
    throw new Error('The expected old origin does not match the armed retirement');
  }
  const actualRevision = configRevision(validated);
  if (expectedRevision !== actualRevision) {
    throw new Error('The expected config revision is stale or incorrect');
  }
  if (validated.pairing) {
    throw new Error('Administrative retirement requires pairing to be disabled');
  }
  if (!retirement.requiredDeviceIds.includes(deviceId)) {
    throw new Error('The selected device is not part of the armed retirement');
  }
  if (retirement.retiredDeviceIds.includes(deviceId)) {
    throw new Error('The selected device already supplied a self-purge receipt');
  }
  if (
    retirement.administrativeAttestations.some(
      (attestation) => attestation.deviceId === deviceId,
    )
  ) {
    throw new Error('The selected device was already administratively retired');
  }
  if (!validated.devices.some((device) => device.id === deviceId)) {
    throw new Error('The selected device is not currently enrolled');
  }

  return validateConfig({
    ...validated,
    csrfSecret: randomToken(32),
    devices: validated.devices.filter((device) => device.id !== deviceId),
    originRetirement: {
      ...retirement,
      administrativeAttestations: [
        ...retirement.administrativeAttestations,
        {
          deviceId,
          basis: ADMINISTRATIVE_RETIREMENT_BASIS,
          receiptStatus: ADMINISTRATIVE_RECEIPT_STATUS,
          localPurgeStatus: ADMINISTRATIVE_LOCAL_PURGE_STATUS,
          attestedAt: new Date(now).toISOString(),
          sourceConfigRevision: actualRevision,
          operatorUid,
          operatorUsername,
          operatorHost,
        },
      ],
    },
  });
}

export function originRetirementComplete(config) {
  const validated = validateConfig(config);
  const retirement = validated.originRetirement;
  if (!retirement) return false;
  return (
    validated.devices.length === 0 &&
    remainingOriginRetirementDeviceIds(validated).length === 0
  );
}

export function remainingOriginRetirementDeviceIds(config) {
  const validated = validateConfig(config);
  const retirement = validated.originRetirement;
  if (!retirement) return [];
  const retired = new Set([
    ...retirement.retiredDeviceIds,
    ...retirement.administrativeAttestations.map(
      (attestation) => attestation.deviceId,
    ),
  ]);
  return retirement.requiredDeviceIds.filter(
    (deviceId) => !retired.has(deviceId),
  );
}

export function migrateToDedicatedOrigin(config, publicOrigin, now = Date.now()) {
  if (!originRetirementComplete(config)) {
    throw new Error(
      'Every old-origin device must supply a self-purge receipt or an explicit administrative deletion attestation before migration',
    );
  }
  const validated = validateConfig(config);
  const origin = parsePublicOrigin(publicOrigin);
  const pairingCode = randomToken(24);
  const completedRetirement = {
    ...validated.originRetirement,
    completedAt: new Date(now).toISOString(),
  };
  return {
    pairingCode,
    config: validateConfig({
      ...validated,
      publicOrigin: origin,
      rpId: new URL(origin).hostname,
      developmentMode: false,
      requireTailscaleIdentity: true,
      reauthenticationMode: REAUTHENTICATION_MODE_FACE_ID,
      allowedTailscaleLogin: null,
      csrfSecret: randomToken(32),
      originRetirement: null,
      completedOriginRetirements: [
        ...validated.completedOriginRetirements,
        completedRetirement,
      ],
      pairing: {
        codeHash: sha256(pairingCode),
        expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(),
      },
      devices: [],
    }),
  };
}

export function getVerificationCode(config) {
  if (!config.pairing) return null;
  return config.pairing.codeHash
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
}

export function configRevision(config) {
  const validated = validateConfig(config);
  const devices = validated.devices
    .map((device) => ({
      id: device.id,
      sessionHash: device.sessionHash,
      previousSessionHash: device.previousSessionHash,
      previousSessionExpiresAt: device.previousSessionExpiresAt,
      tailscaleLogin: device.tailscaleLogin,
      passkeyId: device.passkey?.id,
      passkeyCounter: device.passkey?.counter,
      sessionExpiresAt: device.sessionExpiresAt,
      trustedUntil: device.trustedUntil,
      lockedAt: device.lockedAt,
      lockGeneration: device.lockGeneration,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const retirement = validated.originRetirement
    ? {
        sourceOrigin: validated.originRetirement.sourceOrigin,
        requiredDeviceIds: [
          ...validated.originRetirement.requiredDeviceIds,
        ].sort(),
        retiredDeviceIds: [
          ...validated.originRetirement.retiredDeviceIds,
        ].sort(),
        administrativeAttestations:
          validated.originRetirement.administrativeAttestations
            .map((attestation) => ({ ...attestation }))
            .sort((left, right) =>
              left.deviceId.localeCompare(right.deviceId),
            ),
        startedAt: validated.originRetirement.startedAt,
      }
    : null;
  const completedRetirements = validated.completedOriginRetirements
    .map((record) => ({
      sourceOrigin: record.sourceOrigin,
      requiredDeviceIds: [...record.requiredDeviceIds].sort(),
      retiredDeviceIds: [...record.retiredDeviceIds].sort(),
      administrativeAttestations: record.administrativeAttestations
        .map((attestation) => ({ ...attestation }))
        .sort((left, right) => left.deviceId.localeCompare(right.deviceId)),
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    }))
    .sort((left, right) => left.sourceOrigin.localeCompare(right.sourceOrigin));
  return sha256(
    JSON.stringify({
      version: validated.version,
      bindHost: validated.bindHost,
      port: validated.port,
      publicOrigin: validated.publicOrigin,
      rpId: validated.rpId,
      developmentMode: validated.developmentMode,
      requireTailscaleIdentity: validated.requireTailscaleIdentity,
      reauthenticationMode: validated.reauthenticationMode,
      allowedTailscaleLogin: validated.allowedTailscaleLogin,
      csrfSecret: validated.csrfSecret,
      pairing: validated.pairing,
      devices,
      retirement,
      completedRetirements,
    }),
  );
}

export class ConfigStore {
  #config;
  #configPath;
  #writeQueue = Promise.resolve();

  constructor(configPath, config) {
    this.#configPath = configPath;
    this.#config = validateConfig(config);
  }

  get value() {
    return this.#config;
  }

  async update(mutator) {
    const run = async () => {
      const lockPath = path.join(
        path.dirname(this.#configPath),
        'operation.lock',
      );
      return withOperationLock(
        'relay configuration update',
        async () => {
          const latest = await loadConfig(this.#configPath);
          const draft = structuredClone(latest);
          const next = (await mutator(draft)) || draft;
          const validated = validateConfig(next);
          await saveConfig(this.#configPath, validated);
          this.#config = validated;
          return this.#config;
        },
        lockPath,
      );
    };
    this.#writeQueue = this.#writeQueue.then(run, run);
    return this.#writeQueue;
  }
}
