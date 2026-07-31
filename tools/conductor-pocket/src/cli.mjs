#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { AccessibilityTransport } from './accessibility.mjs';
import {
  ConfigStore,
  configRevision,
  createConfig,
  getVerificationCode,
  loadConfig,
  rotatePairing,
  saveConfig,
  setReauthenticationMode,
} from './config.mjs';
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_CONFIG_PATH,
  DEFAULT_PORT,
  REAUTHENTICATION_MODE_FACE_ID,
  REAUTHENTICATION_MODE_TAILSCALE_SESSION,
  SHELL_REVISION,
} from './constants.mjs';
import { ConductorDatabase, DatabaseWatcher } from './conductor-db.mjs';
import { SecurityManager } from './security.mjs';
import { createPocketServer } from './server.mjs';
import { withOperationLock } from './operation-lock.mjs';
import {
  assertLockedSidecarPrefs,
  assertNoFunnel,
  assertPrivateServeStatus,
  assertSameTailnet,
  pocketRootState,
  runningTailscaleIdentity,
} from './tailscale-config.mjs';

const execFileAsync = promisify(execFile);
process.umask(0o077);
const dedicatedTailscaleSocket = path.join(
  os.homedir(),
  '.config',
  'conductor-pocket',
  'tailscale',
  'tailscaled.sock',
);
const dedicatedTailscaleDirectory = path.dirname(dedicatedTailscaleSocket);
const dedicatedTailscaleLabel = 'com.ovo.conductor-pocket.tailscaled';
const dedicatedTailscaleLaunchAgent = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${dedicatedTailscaleLabel}.plist`,
);
const relayLaunchAgentLabel = 'com.ovo.conductor-pocket';
const relayLaunchAgentPath = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${relayLaunchAgentLabel}.plist`,
);
const RELAY_START_ATTEMPTS = 150;

function parseArguments(values) {
  const parsed = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      parsed._.push(value);
      continue;
    }
    const [key, inlineValue] = value.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (values[index + 1] && !values[index + 1].startsWith('--')) {
      parsed[key] = values[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function integerOption(value, fallback) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`Expected an integer, got ${value}`);
  return parsed;
}

async function existingExecutable(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

async function tailscaleExecutable() {
  return existingExecutable([
    '/opt/homebrew/opt/tailscale/bin/tailscale',
    '/usr/local/opt/tailscale/bin/tailscale',
  ]);
}

async function tailscaleStatus() {
  const executable = await tailscaleExecutable();
  if (!executable) {
    return { ok: false, reason: 'dedicated_tailscale_not_installed' };
  }
  try {
    await fs.access(dedicatedTailscaleSocket);
    const { stdout } = await execFileAsync(
      executable,
      [`--socket=${dedicatedTailscaleSocket}`, 'status', '--json'],
      {
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const status = JSON.parse(stdout);
    const dnsName = status.Self?.DNSName?.replace(/\.$/, '') || null;
    if (status.BackendState !== 'Running' || !dnsName) {
      return { ok: false, reason: 'tailscale_not_running', executable, status };
    }
    return {
      ok: true,
      executable,
      socket: dedicatedTailscaleSocket,
      dnsName,
      publicOrigin: `https://${dnsName}`,
      self: status.Self,
      status,
    };
  } catch {
    return {
      ok: false,
      reason: 'dedicated_tailscale_status_failed',
      executable,
      socket: dedicatedTailscaleSocket,
    };
  }
}

function versionAtLeast(actual, minimum = '1.98.9') {
  const match = String(actual || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const actualParts = match.slice(1).map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return actualParts[index] > minimumParts[index];
    }
  }
  return true;
}

async function sidecarCommand(executable, argumentsList) {
  return execFileAsync(
    executable,
    [`--socket=${dedicatedTailscaleSocket}`, ...argumentsList],
    {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

async function assertDoctorLaunchProfile(executable) {
  const daemon = path.join(path.dirname(executable), 'tailscaled');
  await fs.access(daemon);
  const directoryStat = await fs.stat(dedicatedTailscaleDirectory);
  const agentStat = await fs.stat(dedicatedTailscaleLaunchAgent);
  if (
    (directoryStat.mode & 0o077) !== 0 ||
    (agentStat.mode & 0o077) !== 0
  ) {
    throw new Error('sidecar_files_not_private');
  }
  const { stdout: plistOutput } = await execFileAsync('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    dedicatedTailscaleLaunchAgent,
  ]);
  const plist = JSON.parse(plistOutput);
  const expectedArguments = [
    daemon,
    '--tun=userspace-networking',
    `--statedir=${dedicatedTailscaleDirectory}`,
    `--socket=${dedicatedTailscaleSocket}`,
    '--port=0',
  ];
  if (
    plist.Label !== dedicatedTailscaleLabel ||
    !isDeepStrictEqual(plist.ProgramArguments, expectedArguments) ||
    plist.RunAtLoad !== true ||
    plist.KeepAlive !== true
  ) {
    throw new Error('sidecar_launch_profile_invalid');
  }
  const { stdout: launchdOutput } = await execFileAsync('/bin/launchctl', [
    'print',
    `gui/${process.getuid()}/${dedicatedTailscaleLabel}`,
  ]);
  const pid = Number(/\n\s*pid = (\d+)\s*(?:\n|$)/.exec(launchdOutput)?.[1]);
  const argumentsBlock = /\n\s*arguments = \{\n([\s\S]*?)\n\s*\}/.exec(
    launchdOutput,
  )?.[1];
  const liveArguments = argumentsBlock
    ? argumentsBlock
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : null;
  if (
    !Number.isInteger(pid) ||
    !/\n\s*state = running\s*(?:\n|$)/.test(launchdOutput) ||
    !isDeepStrictEqual(liveArguments, expectedArguments)
  ) {
    throw new Error('sidecar_launch_agent_not_running');
  }
  const { stdout: lsofOutput } = await execFileAsync('/usr/sbin/lsof', [
    '-nP',
    '-F',
    'p',
    '--',
    dedicatedTailscaleSocket,
  ]);
  const pids = new Set(
    [...lsofOutput.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1])),
  );
  if (pids.size !== 1 || !pids.has(pid)) {
    throw new Error('sidecar_socket_owner_mismatch');
  }
}

async function healthStatus(
  origin,
  version = APP_VERSION,
  expectedRevision = null,
  expectedShellRevision = SHELL_REVISION,
) {
  try {
    const response = await fetch(`${origin}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    const body = response.ok ? await response.json() : null;
    return {
      ok:
        body?.ok === true &&
        body.version === version &&
        (!expectedShellRevision ||
          body.shellRevision === expectedShellRevision) &&
        (!expectedRevision || body.configRevision === expectedRevision),
      version: body?.version || null,
      shellRevision: body?.shellRevision || null,
      configRevision: body?.configRevision || null,
    };
  } catch {
    return {
      ok: false,
      version: null,
      shellRevision: null,
      configRevision: null,
    };
  }
}

async function waitForInstalledRelay(config) {
  const healthUrl =
    `http://127.0.0.1:${config.port}/api/health`;
  const expectedRevision = configRevision(config);
  for (
    let attempt = 0;
    attempt < RELAY_START_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const response = await fetch(healthUrl, {
        cache: 'no-store',
        headers: { Host: `127.0.0.1:${config.port}` },
        signal: AbortSignal.timeout(1_000),
      });
      const body = response.ok ? await response.json() : null;
      if (
        body?.ok === true &&
        body.version === APP_VERSION &&
        body.shellRevision === SHELL_REVISION &&
        body.configRevision === expectedRevision
      ) {
        return;
      }
    } catch {
      // launchd may still be replacing the relay.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `The installed relay did not activate ${config.reauthenticationMode}`,
  );
}

async function restartInstalledRelay(config) {
  await execFileAsync('/bin/launchctl', [
    'kickstart',
    '-k',
    `gui/${process.getuid()}/${relayLaunchAgentLabel}`,
  ]);
  await waitForInstalledRelay(config);
}

async function ensureInstalledRelay(config) {
  const health = await healthStatus(
    `http://127.0.0.1:${config.port}`,
    APP_VERSION,
    configRevision(config),
  );
  if (!health.ok) {
    await restartInstalledRelay(config);
  }
}

async function stopInstalledRelay() {
  await execFileAsync('/bin/launchctl', [
    'bootout',
    `gui/${process.getuid()}/${relayLaunchAgentLabel}`,
  ]);
}

async function mainTailscaleStatus(executable) {
  await fs.access(executable);
  const { stdout } = await execFileAsync(executable, ['status', '--json'], {
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { executable, status: JSON.parse(stdout) };
}

async function assertTrustedSessionIngress(config) {
  if (
    config.reauthenticationMode !==
    REAUTHENTICATION_MODE_TAILSCALE_SESSION
  ) {
    return;
  }
  const tailscale = await tailscaleStatus();
  if (!tailscale.ok || !versionAtLeast(tailscale.status.Version)) {
    throw new Error(
      'tailscale-session requires the audited dedicated Tailscale node',
    );
  }
  if (
    config.publicOrigin !== tailscale.publicOrigin ||
    config.rpId !== tailscale.dnsName
  ) {
    throw new Error(
      'tailscale-session requires Pocket to own its dedicated browser origin',
    );
  }
  await assertDoctorLaunchProfile(tailscale.executable);
  const { stdout: prefsOutput } = await sidecarCommand(
    tailscale.executable,
    ['debug', 'prefs'],
  );
  assertLockedSidecarPrefs(JSON.parse(prefsOutput));
  const { stdout: serveOutput } = await sidecarCommand(
    tailscale.executable,
    ['serve', 'status', '--json'],
  );
  assertPrivateServeStatus(JSON.parse(serveOutput || '{}'), {
    rpId: config.rpId,
    port: config.port,
  });
  const { stdout: funnelOutput } = await sidecarCommand(
    tailscale.executable,
    ['funnel', 'status', '--json'],
  );
  assertNoFunnel(JSON.parse(funnelOutput || '{}'));
  const main = await mainTailscaleStatus(tailscale.executable);
  if (!versionAtLeast(main.status.Version)) {
    throw new Error('main_tailscale_version_unsupported');
  }
  assertSameTailnet(tailscale.status, main.status);
  const sidecarIdentity = runningTailscaleIdentity(tailscale.status);
  const mainIdentity = runningTailscaleIdentity(main.status);
  const mainAddresses = new Set(mainIdentity.addresses);
  if (
    sidecarIdentity.dnsName === mainIdentity.dnsName ||
    sidecarIdentity.addresses.some((address) =>
      mainAddresses.has(address),
    )
  ) {
    throw new Error('sidecar_identity_not_isolated');
  }
  const { stdout: mainServeOutput } = await execFileAsync(
    main.executable,
    ['serve', 'status', '--json'],
    { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
  );
  if (
    pocketRootState(
      JSON.parse(mainServeOutput || '{}'),
      {
        rpId: mainIdentity.dnsName,
        port: config.port,
      },
    ) === 'pocket'
  ) {
    throw new Error('old_shared_root_still_configured');
  }
}

async function macName() {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/scutil', [
      '--get',
      'ComputerName',
    ]);
    if (stdout.trim()) return stdout.trim();
  } catch {
    // The hostname is a safe fallback.
  }
  return os.hostname();
}

function pairingOutput(config, pairingCode) {
  const url = `${config.publicOrigin}/#pair=${encodeURIComponent(pairingCode)}`;
  return [
    '',
    'Pairing link (single use, expires in 15 minutes):',
    url,
    '',
    `Verification code shown on both devices: ${getVerificationCode(config)}`,
    '',
    'Do not post this link or put it in a shared password manager.',
  ].join('\n');
}

async function setup(options) {
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);
  const port = integerOption(options.port, DEFAULT_PORT);
  const developmentMode = options.development === true;
  let publicOrigin = options.origin;
  if (!publicOrigin && developmentMode) {
    publicOrigin = `http://127.0.0.1:${port}`;
  }
  if (!developmentMode) {
    const tailscale = await tailscaleStatus();
    if (!tailscale.ok) {
      throw new Error(
        'The dedicated Conductor Pocket Tailscale node must be connected before setup. Run npm run sidecar:install and npm run sidecar:login first.',
      );
    }
    if (
      publicOrigin &&
      new URL(publicOrigin).origin !== tailscale.publicOrigin
    ) {
      throw new Error(
        '--origin must exactly match the authenticated dedicated Tailscale node; arbitrary production origins are forbidden',
      );
    }
    publicOrigin = tailscale.publicOrigin;
  }

  try {
    await fs.access(configPath);
    throw new Error(
      `Config already exists at ${configPath}. Use the pair command to create another one-time link.`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const created = createConfig({
    publicOrigin,
    port,
    developmentMode,
    requireTailscaleIdentity: !developmentMode,
  });
  created.config.macName = await macName();
  await saveConfig(configPath, created.config);
  process.stdout.write(
    `${APP_NAME} config created at ${configPath}\n${pairingOutput(
      created.config,
      created.pairingCode,
    )}\n`,
  );
}

async function pair(options) {
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);
  const lockPath = path.join(path.dirname(configPath), 'operation.lock');
  await withOperationLock(
    'rotate the Pocket pairing secret',
    async () => {
      const config = await loadConfig(configPath);
      const rotated = rotatePairing(config);
      await saveConfig(configPath, rotated.config);
      const launchAgentPath = path.join(
        os.homedir(),
        'Library',
        'LaunchAgents',
        'com.ovo.conductor-pocket.plist',
      );
      try {
        await fs.access(launchAgentPath);
        await execFileAsync('/bin/launchctl', [
          'kickstart',
          '-k',
          `gui/${process.getuid()}/com.ovo.conductor-pocket`,
        ]);
        const healthUrl = `http://127.0.0.1:${rotated.config.port}/api/health`;
        let healthy = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            const response = await fetch(healthUrl, {
              cache: 'no-store',
              signal: AbortSignal.timeout(1_000),
            });
            const body = response.ok ? await response.json() : null;
            if (
              body?.ok === true &&
              body.version === APP_VERSION &&
              body.shellRevision === SHELL_REVISION &&
              body.configRevision === configRevision(rotated.config)
            ) {
              healthy = true;
              break;
            }
          } catch {
            // launchd may still be replacing the relay.
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        if (!healthy) {
          throw new Error(
            `The installed relay did not reload Conductor Pocket ${APP_VERSION}`,
          );
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      process.stdout.write(
        `${pairingOutput(rotated.config, rotated.pairingCode)}\n`,
      );
    },
    lockPath,
  );
}

async function authMode(options) {
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);
  const mode = options.mode || options._[1];
  if (
    mode !== REAUTHENTICATION_MODE_FACE_ID &&
    mode !== REAUTHENTICATION_MODE_TAILSCALE_SESSION
  ) {
    throw new Error(
      'auth-mode must be face-id or tailscale-session',
    );
  }
  const lockPath = path.join(
    path.dirname(configPath),
    'operation.lock',
  );
  await withOperationLock(
    'change Pocket authentication mode',
    async () => {
      const prior = await loadConfig(configPath);
      const proposed = setReauthenticationMode(
        prior,
        mode,
        Date.now(),
      );
      await assertTrustedSessionIngress(proposed);
      await fs.access(relayLaunchAgentPath);
      if (isDeepStrictEqual(prior, proposed)) {
        try {
          await ensureInstalledRelay(prior);
        } catch (activationError) {
          try {
            await stopInstalledRelay();
          } catch (stopError) {
            throw new AggregateError(
              [activationError, stopError],
              'Pocket authentication mode could not be verified and the relay could not be stopped',
            );
          }
          throw new Error(
            'Pocket authentication mode could not be verified; the relay was stopped',
            { cause: activationError },
          );
        }
        return;
      }
      await saveConfig(configPath, proposed);
      try {
        await restartInstalledRelay(proposed);
      } catch (activationError) {
        if (
          mode === REAUTHENTICATION_MODE_TAILSCALE_SESSION &&
          prior.reauthenticationMode !==
            REAUTHENTICATION_MODE_TAILSCALE_SESSION
        ) {
          try {
            await saveConfig(configPath, prior);
            await restartInstalledRelay(prior);
          } catch (rollbackError) {
            try {
              await stopInstalledRelay();
            } catch (stopError) {
              throw new AggregateError(
                [activationError, rollbackError, stopError],
                'Trusted-session activation and strict-mode rollback failed',
              );
            }
            throw new AggregateError(
              [activationError, rollbackError],
              'Trusted-session activation failed; the relay was stopped after rollback failed',
            );
          }
          throw new Error(
            'Trusted-session activation failed and was rolled back to Face ID',
            { cause: activationError },
          );
        }
        try {
          await stopInstalledRelay();
        } catch (stopError) {
          throw new AggregateError(
            [activationError, stopError],
            'Face ID activation failed and the prior relay could not be stopped',
          );
        }
        throw new Error(
          'Face ID activation failed; strict config remains on disk and the relay was stopped',
          { cause: activationError },
        );
      }
    },
    lockPath,
  );
  process.stdout.write(
    `Conductor Pocket authentication mode: ${mode}\n`,
  );
}

async function serve(options) {
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);
  const config = await loadConfig(configPath);
  await assertTrustedSessionIngress(config);
  const store = new ConfigStore(configPath, config);
  const database = new ConductorDatabase(config.dbPath);
  const watcher = new DatabaseWatcher(config.dbPath);
  const transport = new AccessibilityTransport();
  const security = new SecurityManager(store);
  const server = createPocketServer({
    configStore: store,
    security,
    database,
    watcher,
    transport,
    audit(event) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  });
  watcher.start();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.bindHost, resolve);
  });
  process.stdout.write(
    `${APP_NAME} ${APP_VERSION} listening on http://${config.bindHost}:${config.port}\nPrivate URL: ${config.publicOrigin}\n`,
  );

  const shutdown = () => {
    server.close(() => {
      database.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function doctor(options) {
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);
  let config;
  try {
    config = await loadConfig(configPath);
  } catch {
    config = null;
  }
  const tailscale = await tailscaleStatus();
  const transport = new AccessibilityTransport();
  const accessibility = await transport.doctor();
  let database = { ok: false, reason: 'config_missing' };
  let ingress = { ok: false, reason: 'config_missing' };
  let relay = { ok: false, reason: 'config_missing' };
  if (config) {
    const expectedRevision = configRevision(config);
    const loopback = await healthStatus(
      `http://127.0.0.1:${config.port}`,
      APP_VERSION,
      expectedRevision,
    );
    const privateHttps = await healthStatus(
      config.publicOrigin,
      APP_VERSION,
      expectedRevision,
    );
    relay = {
      ok: loopback.ok && privateHttps.ok,
      loopback,
      privateHttps,
      expectedVersion: APP_VERSION,
      expectedShellRevision: SHELL_REVISION,
      expectedRevision,
      reason:
        loopback.ok && privateHttps.ok
          ? null
          : 'installed_relay_or_https_mismatch',
    };
    try {
      const conductor = new ConductorDatabase(config.dbPath);
      const counts = conductor.listWorkspaces().length;
      conductor.close();
      database = { ok: true, workspaceCount: counts };
    } catch {
      database = { ok: false, reason: 'database_unavailable' };
    }
    if (tailscale.ok) {
      try {
        if (!versionAtLeast(tailscale.status.Version)) {
          throw new Error('sidecar_version_unsupported');
        }
        if (
          config.publicOrigin !== tailscale.publicOrigin ||
          config.rpId !== tailscale.dnsName
        ) {
          throw new Error('origin_mismatch');
        }
        await assertDoctorLaunchProfile(tailscale.executable);
        const { stdout: prefsOutput } = await sidecarCommand(
          tailscale.executable,
          ['debug', 'prefs'],
        );
        assertLockedSidecarPrefs(JSON.parse(prefsOutput));
        const { stdout: serveOutput } = await sidecarCommand(
          tailscale.executable,
          ['serve', 'status', '--json'],
        );
        const serveStatus = JSON.parse(serveOutput || '{}');
        assertPrivateServeStatus(serveStatus, {
          rpId: config.rpId,
          port: config.port,
        });
        const { stdout: funnelOutput } = await sidecarCommand(
          tailscale.executable,
          ['funnel', 'status', '--json'],
        );
        assertNoFunnel(JSON.parse(funnelOutput || '{}'));
        const main = await mainTailscaleStatus(tailscale.executable);
        if (!versionAtLeast(main.status.Version)) {
          throw new Error('main_tailscale_version_unsupported');
        }
        assertSameTailnet(tailscale.status, main.status);
        const sidecarIdentity = runningTailscaleIdentity(tailscale.status);
        const mainIdentity = runningTailscaleIdentity(main.status);
        const mainAddresses = new Set(mainIdentity.addresses);
        if (
          sidecarIdentity.dnsName === mainIdentity.dnsName ||
          sidecarIdentity.addresses.some((address) =>
            mainAddresses.has(address),
          )
        ) {
          throw new Error('sidecar_identity_not_isolated');
        }
        const { stdout: mainServeOutput } = await execFileAsync(
          main.executable,
          ['serve', 'status', '--json'],
          { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 },
        );
        const oldRoot = pocketRootState(
          JSON.parse(mainServeOutput || '{}'),
          {
            rpId: mainIdentity.dnsName,
            port: config.port,
          },
        );
        if (oldRoot === 'pocket') {
          throw new Error('old_shared_root_still_configured');
        }
        ingress = {
          ok: relay.ok,
          exclusiveRoot: true,
          funnel: false,
          sameTailnet: true,
          distinctIdentity: true,
          auditedLaunchAgent: true,
          oldPocketRoot: oldRoot,
          reason: relay.ok ? null : relay.reason,
        };
      } catch (error) {
        ingress = {
          ok: false,
          reason:
            error instanceof Error && error.message === 'origin_mismatch'
              ? 'origin_mismatch'
              : error instanceof Error
                ? error.message
                : 'dedicated_ingress_invalid',
        };
      }
    } else {
      ingress = { ok: false, reason: tailscale.reason };
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        config: config
          ? {
              ok: true,
              path: configPath,
              publicOrigin: config.publicOrigin,
              loopbackOnly: config.bindHost === '127.0.0.1',
              tailscaleIdentityRequired: config.requireTailscaleIdentity,
              reauthenticationMode: config.reauthenticationMode,
              pairedDevices: config.devices.length,
            }
          : { ok: false, path: configPath },
        tailscale: {
          ok: tailscale.ok,
          reason: tailscale.ok ? null : tailscale.reason,
          dnsName: tailscale.ok ? tailscale.dnsName : null,
          dedicated: true,
        },
        ingress,
        relay,
        conductorDatabase: database,
        accessibility,
      },
      null,
      2,
    )}\n`,
  );
  if (
    !config ||
    !tailscale.ok ||
    !ingress.ok ||
    !relay.ok ||
    !database.ok ||
    !accessibility.ok
  ) {
    process.exitCode = 1;
  }
}

function usage() {
  process.stdout.write(`Usage:
  node src/cli.mjs setup [--origin https://mac.tailnet.ts.net] [--port 4317]
  node src/cli.mjs pair
  node src/cli.mjs auth-mode face-id|tailscale-session
  node src/cli.mjs serve
  node src/cli.mjs doctor

All commands accept --config /absolute/path/config.json.
`);
}

const options = parseArguments(process.argv.slice(2));
const command = options._[0];

try {
  if (command === 'setup') await setup(options);
  else if (command === 'pair') await pair(options);
  else if (command === 'auth-mode') await authMode(options);
  else if (command === 'serve') await serve(options);
  else if (command === 'doctor') await doctor(options);
  else usage();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
