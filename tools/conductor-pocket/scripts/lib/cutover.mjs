import {
  assertRootRemovedWithHandlersPreserved,
  pocketRootState,
} from '../../src/tailscale-config.mjs';
import {
  migrateToDedicatedOrigin,
  rotatePairing,
} from '../../src/config.mjs';

const ADMINISTRATIVE_RETIREMENT_VALUE_OPTIONS = [
  '--administratively-retire-device',
  '--expect-origin',
  '--expect-revision',
];
const ADMINISTRATIVE_RETIREMENT_ACKNOWLEDGEMENTS = [
  '--confirm-reported-ios-app-deleted',
  '--acknowledge-local-purge-unverified',
];

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function parseAdministrativeRetirementArgs(argumentsList) {
  if (argumentsList.length === 0) return null;
  const allowedOptions = new Set([
    ...ADMINISTRATIVE_RETIREMENT_VALUE_OPTIONS,
    ...ADMINISTRATIVE_RETIREMENT_ACKNOWLEDGEMENTS,
  ]);
  const parsed = Object.fromEntries(
    ADMINISTRATIVE_RETIREMENT_VALUE_OPTIONS.map((option) => [option, []]),
  );
  const acknowledgementCounts = Object.fromEntries(
    ADMINISTRATIVE_RETIREMENT_ACKNOWLEDGEMENTS.map((option) => [option, 0]),
  );
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (ADMINISTRATIVE_RETIREMENT_VALUE_OPTIONS.includes(argument)) {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires one value`);
      }
      parsed[argument].push(value);
      index += 1;
      continue;
    }
    if (ADMINISTRATIVE_RETIREMENT_ACKNOWLEDGEMENTS.includes(argument)) {
      acknowledgementCounts[argument] += 1;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(
        `Administrative retirement refuses unsupported option ${argument}`,
      );
    }
    throw new Error(
      `Administrative retirement refuses unexpected argument ${argument}`,
    );
  }
  for (const option of ADMINISTRATIVE_RETIREMENT_VALUE_OPTIONS) {
    if (parsed[option].length > 1) {
      throw new Error(`${option} may be provided only once`);
    }
    if (parsed[option].length === 0) {
      throw new Error(
        `Administrative retirement requires exactly one ${option}`,
      );
    }
  }
  for (const option of ADMINISTRATIVE_RETIREMENT_ACKNOWLEDGEMENTS) {
    if (acknowledgementCounts[option] !== 1) {
      throw new Error(
        `Administrative retirement requires exactly one ${option}`,
      );
    }
  }

  return {
    deviceId: parsed['--administratively-retire-device'][0],
    expectedOrigin: parsed['--expect-origin'][0],
    expectedRevision: parsed['--expect-revision'][0],
  };
}

export function parseCutoverArgs(argumentsList) {
  if (argumentsList.length === 0) {
    return {
      attestNoOldDevices: false,
      administrativeRetirement: null,
    };
  }
  if (
    argumentsList.length === 1 &&
    argumentsList[0] === '--attest-no-old-devices'
  ) {
    return {
      attestNoOldDevices: true,
      administrativeRetirement: null,
    };
  }
  return {
    attestNoOldDevices: false,
    administrativeRetirement:
      parseAdministrativeRetirementArgs(argumentsList),
  };
}

export async function activateAdministrativeRetirement({
  nextConfig,
  save,
  restart,
  verify,
  stopRelay,
}) {
  try {
    await save(nextConfig);
    await restart(nextConfig);
    await verify(nextConfig.publicOrigin, nextConfig);
    return nextConfig;
  } catch (primaryError) {
    try {
      await stopRelay();
    } catch (stopError) {
      throw new AggregateError(
        [primaryError, stopError],
        `Administrative retirement activation failed (${errorMessage(
          primaryError,
        )}); stopping the relay also failed (${errorMessage(stopError)})`,
      );
    }
    throw primaryError;
  }
}

export async function waitForExpectedHealth(
  origin,
  {
    version,
    configRevision,
    fetchImpl = fetch,
    attempts = 60,
    delayMs = 500,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${origin}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (
          body?.ok === true &&
          body.version === version &&
          (!configRevision || body.configRevision === configRevision)
        ) {
          return body;
        }
      }
    } catch {
      // DNS, certificate provisioning, or the replacement relay may still be starting.
    }
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  throw new Error(
    `Conductor Pocket ${version} did not become healthy at ${origin}`,
  );
}

export async function removeMainPocketRoot({
  mainCli,
  rpId,
  port,
  runCommand,
  requirePocket = false,
}) {
  const { stdout: beforeOutput } = await runCommand(mainCli, [
    'serve',
    'status',
    '--json',
  ]);
  const before = JSON.parse(beforeOutput || '{}');
  const state = pocketRootState(before, { rpId, port });
  if (state !== 'pocket') {
    if (requirePocket) {
      throw new Error(
        state === 'foreign'
          ? 'The main-node root belongs to another service'
          : 'The expected old Pocket root is not configured',
      );
    }
    return { removed: false, state, before, after: before };
  }

  await runCommand(mainCli, [
    'serve',
    '--yes',
    '--https=443',
    '--set-path=/',
    'off',
  ]);
  const { stdout: afterOutput } = await runCommand(mainCli, [
    'serve',
    'status',
    '--json',
  ]);
  const after = JSON.parse(afterOutput || '{}');
  assertRootRemovedWithHandlersPreserved(before, after, { rpId, port });
  return { removed: true, state, before, after };
}

export async function migrateRelayOrigin({
  oldConfig,
  dedicatedOrigin,
  save,
  restart,
  verify,
  removeOldRoot,
  now = Date.now(),
}) {
  const migrated = migrateToDedicatedOrigin(
    oldConfig,
    dedicatedOrigin,
    now,
  );
  let dedicatedVerified = false;
  try {
    await save(migrated.config);
    await restart(migrated.config);
    await verify(migrated.config.publicOrigin, migrated.config);
    dedicatedVerified = true;
    await removeOldRoot();
    return migrated;
  } catch (primaryError) {
    if (!dedicatedVerified) {
      try {
        await save(oldConfig);
        await restart(oldConfig);
        await verify(oldConfig.publicOrigin, oldConfig);
      } catch (rollbackError) {
        throw new AggregateError(
          [primaryError, rollbackError],
          `Dedicated-origin migration failed (${errorMessage(
            primaryError,
          )}); restoring the old relay also failed (${errorMessage(
            rollbackError,
          )})`,
        );
      }
    }
    throw primaryError;
  }
}

export async function resumeDedicatedOrigin({
  config,
  save,
  restart,
  verify,
  removeOldRoot,
  now = Date.now(),
}) {
  await verify(config.publicOrigin, config);
  const cleanup = await removeOldRoot();
  if (config.devices.length > 0) {
    return {
      config,
      pairingCode: null,
      cleanup,
    };
  }
  const rotated = rotatePairing(config, now);
  await save(rotated.config);
  await restart(rotated.config);
  await verify(rotated.config.publicOrigin, rotated.config);
  return {
    ...rotated,
    cleanup,
  };
}
