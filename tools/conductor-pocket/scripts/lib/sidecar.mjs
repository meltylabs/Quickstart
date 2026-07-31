import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DATA_DIRECTORY = path.join(
  os.homedir(),
  '.config',
  'conductor-pocket',
);
export const SIDECAR_DIRECTORY = path.join(DATA_DIRECTORY, 'tailscale');
export const SIDECAR_SOCKET_PATH = path.join(
  SIDECAR_DIRECTORY,
  'tailscaled.sock',
);
export const SIDECAR_LABEL = 'com.ovo.conductor-pocket.tailscaled';
export const SIDECAR_LAUNCH_AGENT_PATH = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${SIDECAR_LABEL}.plist`,
);
export const RELAY_LABEL = 'com.ovo.conductor-pocket';
export const RELAY_LAUNCH_AGENT_PATH = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${RELAY_LABEL}.plist`,
);

export function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function sidecarCliArguments(
  argumentsList,
  socketPath = SIDECAR_SOCKET_PATH,
) {
  if (!path.isAbsolute(socketPath)) {
    throw new Error('The dedicated Tailscale socket path must be absolute');
  }
  return [`--socket=${socketPath}`, ...argumentsList];
}

export function sidecarDaemonArguments(
  daemon,
  {
    stateDirectory = SIDECAR_DIRECTORY,
    socketPath = SIDECAR_SOCKET_PATH,
  } = {},
) {
  if (
    !path.isAbsolute(daemon) ||
    !path.isAbsolute(stateDirectory) ||
    !path.isAbsolute(socketPath)
  ) {
    throw new Error('Every dedicated Tailscale daemon path must be absolute');
  }
  return [
    daemon,
    '--tun=userspace-networking',
    `--statedir=${stateDirectory}`,
    `--socket=${socketPath}`,
    '--port=0',
  ];
}

export function launchdArguments(output) {
  const block = /\n\s*arguments = \{\n([\s\S]*?)\n\s*\}/.exec(
    String(output),
  )?.[1];
  if (!block) return null;
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function versionAtLeast(actual, minimum) {
  const parse = (value) =>
    String(value)
      .split('.')
      .map((part) => Number(part));
  const actualParts = parse(actual);
  const minimumParts = parse(minimum);
  if (
    actualParts.some((part) => !Number.isInteger(part)) ||
    minimumParts.some((part) => !Number.isInteger(part))
  ) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    const left = actualParts[index] || 0;
    const right = minimumParts[index] || 0;
    if (left !== right) return left > right;
  }
  return true;
}

export async function formulaBinaries() {
  const prefixes = ['/opt/homebrew/opt/tailscale', '/usr/local/opt/tailscale'];
  for (const prefix of prefixes) {
    const cli = path.join(prefix, 'bin', 'tailscale');
    const daemon = path.join(prefix, 'bin', 'tailscaled');
    try {
      await Promise.all([
        fs.access(cli, fs.constants.X_OK),
        fs.access(daemon, fs.constants.X_OK),
      ]);
      return { cli, daemon };
    } catch {
      // Try the next Homebrew prefix.
    }
  }
  throw new Error(
    'The Homebrew tailscale formula is required. Run: brew install tailscale',
  );
}

export function statusVersion(status) {
  const match = String(status?.Version || '').match(/^(\d+\.\d+\.\d+)/);
  return match?.[1] || null;
}

export async function assertSupportedTailscaleVersion(cli, minimum = '1.98.9') {
  const { stdout } = await run(cli, ['version', '--json']);
  const version = JSON.parse(stdout)?.majorMinorPatch;
  if (!versionAtLeast(version, minimum)) {
    throw new Error(
      `Tailscale ${minimum} or newer is required; the CLI reported ${version || 'an unknown version'}`,
    );
  }
  return version;
}

export function assertSupportedStatusVersion(status, minimum = '1.98.9') {
  const version = statusVersion(status);
  if (!versionAtLeast(version, minimum)) {
    throw new Error(
      `The running Tailscale daemon must be ${minimum} or newer; it reported ${
        version || 'an unknown version'
      }`,
    );
  }
  return version;
}

export async function mainTailscaleCli() {
  const executable = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  try {
    await fs.access(executable, fs.constants.X_OK);
    return executable;
  } catch {
    throw new Error(
      'The macOS Tailscale app CLI was not found; refusing to guess which daemon is the main node',
    );
  }
}

export async function assertSidecarLaunchProfile(daemon) {
  const { stdout: plistOutput } = await run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    SIDECAR_LAUNCH_AGENT_PATH,
  ]);
  const plist = JSON.parse(plistOutput);
  const expectedArguments = sidecarDaemonArguments(daemon);
  if (
    plist.Label !== SIDECAR_LABEL ||
    !isDeepStrictEqual(plist.ProgramArguments, expectedArguments) ||
    plist.RunAtLoad !== true ||
    plist.KeepAlive !== true
  ) {
    throw new Error(
      'The dedicated Tailscale LaunchAgent does not match the audited profile',
    );
  }
  const target = `gui/${process.getuid()}/${SIDECAR_LABEL}`;
  const { stdout: launchdOutput } = await run('/bin/launchctl', [
    'print',
    target,
  ]);
  const pid = Number(/\n\s*pid = (\d+)\s*(?:\n|$)/.exec(launchdOutput)?.[1]);
  if (
    !Number.isInteger(pid) ||
    pid < 1 ||
    !/\n\s*state = running\s*(?:\n|$)/.test(launchdOutput) ||
    !launchdOutput.includes(`path = ${SIDECAR_LAUNCH_AGENT_PATH}`) ||
    !isDeepStrictEqual(
      launchdArguments(launchdOutput),
      expectedArguments,
    )
  ) {
    throw new Error('The audited dedicated Tailscale LaunchAgent is not running');
  }
  const { stdout: lsofOutput } = await run('/usr/sbin/lsof', [
    '-nP',
    '-F',
    'p',
    '--',
    SIDECAR_SOCKET_PATH,
  ]);
  const socketPids = new Set(
    [...lsofOutput.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1])),
  );
  if (socketPids.size !== 1 || !socketPids.has(pid)) {
    throw new Error(
      'The process owning the dedicated Tailscale socket is not the audited LaunchAgent',
    );
  }
  return { pid, arguments: expectedArguments };
}

export async function relayListenerPids(
  port,
  { runCommand = run } = {},
) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('The relay listener port is invalid');
  }
  try {
    const { stdout } = await runCommand('/usr/sbin/lsof', [
      '-nP',
      '-a',
      '-F',
      'p',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
    ]);
    return [
      ...new Set(
        [...stdout.matchAll(/^p(\d+)$/gm)].map((match) => Number(match[1])),
      ),
    ];
  } catch (error) {
    if (error?.code === 1 || error?.code === '1') return [];
    throw error;
  }
}

async function readLaunchAgentPlist(agentPath) {
  const { stdout } = await run('/usr/bin/plutil', [
    '-convert',
    'json',
    '-o',
    '-',
    agentPath,
  ]);
  return JSON.parse(stdout);
}

async function readLaunchAgentState(label) {
  const { stdout } = await run('/bin/launchctl', [
    'print',
    `gui/${process.getuid()}/${label}`,
  ]);
  return stdout;
}

export async function assertRelayLaunchProfile(
  { configPath, port },
  {
    access = fs.access,
    realpath = fs.realpath,
    stat = fs.stat,
    readPlist = readLaunchAgentPlist,
    readLaunchd = readLaunchAgentState,
    readListenerPids = relayListenerPids,
  } = {},
) {
  if (!path.isAbsolute(configPath)) {
    throw new Error('The relay config path must be absolute');
  }
  const agentStat = await stat(RELAY_LAUNCH_AGENT_PATH);
  if ((agentStat.mode & 0o077) !== 0) {
    throw new Error('The Pocket relay LaunchAgent is not private');
  }
  const plist = await readPlist(RELAY_LAUNCH_AGENT_PATH);
  const argumentsList = plist.ProgramArguments;
  if (
    plist.Label !== RELAY_LABEL ||
    plist.RunAtLoad !== true ||
    !Array.isArray(argumentsList) ||
    argumentsList.length !== 6 ||
    !path.isAbsolute(argumentsList[0]) ||
    argumentsList[1] !== '--no-warnings=ExperimentalWarning' ||
    !path.isAbsolute(argumentsList[2]) ||
    argumentsList[3] !== 'serve' ||
    argumentsList[4] !== '--config' ||
    argumentsList[5] !== configPath ||
    !path.isAbsolute(plist.WorkingDirectory)
  ) {
    throw new Error('The Pocket relay LaunchAgent profile is invalid');
  }
  await Promise.all([
    access(argumentsList[0], fs.constants.X_OK),
    access(argumentsList[2], fs.constants.R_OK),
    access(configPath, fs.constants.R_OK),
  ]);
  const [runtimeParent, workingDirectory, cliPath] = await Promise.all([
    realpath(path.join(DATA_DIRECTORY, 'runtimes')),
    realpath(plist.WorkingDirectory),
    realpath(argumentsList[2]),
  ]);
  const relativeRuntime = path.relative(runtimeParent, workingDirectory);
  if (
    !relativeRuntime ||
    relativeRuntime.startsWith('..') ||
    path.isAbsolute(relativeRuntime) ||
    !path.basename(workingDirectory).startsWith('runtime-') ||
    cliPath !== path.join(workingDirectory, 'src', 'cli.mjs')
  ) {
    throw new Error('The Pocket relay runtime path is outside the private runtime store');
  }

  const launchdOutput = await readLaunchd(RELAY_LABEL);
  const pid = Number(/\n\s*pid = (\d+)\s*(?:\n|$)/.exec(launchdOutput)?.[1]);
  if (
    !Number.isInteger(pid) ||
    pid < 1 ||
    !/\n\s*state = running\s*(?:\n|$)/.test(launchdOutput) ||
    !launchdOutput.includes(`path = ${RELAY_LAUNCH_AGENT_PATH}`) ||
    !isDeepStrictEqual(launchdArguments(launchdOutput), argumentsList)
  ) {
    throw new Error('The audited Pocket relay LaunchAgent is not running');
  }
  const listenerPids = await readListenerPids(port);
  if (listenerPids.length !== 1 || listenerPids[0] !== pid) {
    throw new Error(
      'The process owning the Pocket relay listener is not the audited LaunchAgent',
    );
  }
  return { pid, arguments: argumentsList, workingDirectory };
}

async function defaultRelayHealthProbe(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(500),
    });
    return true;
  } catch {
    return false;
  }
}

export async function waitForRelayShutdown(
  { port, expectedPid },
  {
    readListenerPids = relayListenerPids,
    probeHealth = defaultRelayHealthProbe,
    attempts = 100,
    delayMs = 100,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let unexpectedListener = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [listenerPids, healthReachable] = await Promise.all([
      readListenerPids(port),
      probeHealth(port),
    ]);
    unexpectedListener ||= listenerPids.some((pid) => pid !== expectedPid);
    if (listenerPids.length === 0 && !healthReachable) return;
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  if (unexpectedListener) {
    throw new Error(
      'An unexpected process still owns the Pocket relay listener after shutdown',
    );
  }
  throw new Error(
    'The Pocket relay listener or health endpoint remained reachable after shutdown',
  );
}

export function run(executable, argumentsList, options = {}) {
  return execFileAsync(executable, argumentsList, {
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
}

export function launchdNotFound(error) {
  const output = `${error?.message || ''}\n${error?.stderr || ''}\n${
    error?.stdout || ''
  }`;
  return /could not find (?:specified )?service|service not found|boot-out failed:\s*3:\s*no such process/i.test(
    output,
  );
}

export async function bootoutIfLoaded(label) {
  const target = `gui/${process.getuid()}/${label}`;
  try {
    await run('/bin/launchctl', ['bootout', target]);
    return true;
  } catch (error) {
    if (launchdNotFound(error)) return false;
    throw error;
  }
}

export async function runSidecar(argumentsList, options = {}) {
  const { cli } = await formulaBinaries();
  return run(cli, sidecarCliArguments(argumentsList), options);
}

export async function readSidecarStatus(options = {}) {
  const { stdout } = await runSidecar(['status', '--json'], options);
  return JSON.parse(stdout);
}

export function validatedSidecarAuthUrl(value) {
  if (value == null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^https:\/\/login\.tailscale\.com\/a\/[A-Za-z0-9_-]{6,128}$/.test(
      value,
    )
  ) {
    throw new Error('The dedicated Tailscale daemon returned an untrusted login URL');
  }
  const authUrl = new URL(value);
  if (authUrl.href !== value) {
    throw new Error(
      'The dedicated Tailscale daemon returned a non-canonical login URL',
    );
  }
  return value;
}

export function sidecarLoginOutcome(status) {
  if (status?.BackendState === 'Running') {
    return { status, authUrl: null };
  }
  const authUrl = validatedSidecarAuthUrl(status?.AuthURL);
  return authUrl ? { status, authUrl } : null;
}

function abortError() {
  const error = new Error('Sidecar login observation was cancelled');
  error.name = 'AbortError';
  return error;
}

function boundedPromise(promise, timeoutMs, timeoutMessage, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(
      () => finish(reject, new Error(timeoutMessage)),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

export async function waitForSidecarLoginOutcome({
  readStatus = readSidecarStatus,
  deadlineMs = 20_000,
  statusTimeoutMs = 2_000,
  pollDelayMs = 200,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
  signal,
} = {}) {
  const deadline = now() + deadlineMs;
  const maximumReads =
    Math.ceil(deadlineMs / Math.max(1, pollDelayMs)) + 1;
  let lastReadError = null;
  for (let read = 0; read < maximumReads; read += 1) {
    if (signal?.aborted) throw abortError();
    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    let status = null;
    try {
      const readTimeoutMs = Math.max(
        1,
        Math.min(statusTimeoutMs, remainingMs),
      );
      status = await boundedPromise(
        Promise.resolve().then(() =>
          readStatus({ timeout: readTimeoutMs, signal }),
        ),
        readTimeoutMs,
        'The dedicated Tailscale status read timed out',
        signal,
      );
      lastReadError = null;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastReadError = error;
    }
    const outcome = sidecarLoginOutcome(status);
    if (outcome) return outcome;
    const delayMs = Math.min(pollDelayMs, Math.max(0, deadline - now()));
    if (delayMs > 0) {
      await boundedPromise(
        Promise.resolve().then(() => sleep(delayMs)),
        delayMs + 100,
        'The dedicated Tailscale login poll stalled',
        signal,
      );
    }
  }
  throw new Error(
    lastReadError
      ? 'The dedicated Tailscale daemon stopped answering during login'
      : 'The dedicated Tailscale daemon did not produce a login URL',
    lastReadError ? { cause: lastReadError } : undefined,
  );
}

export async function readSidecarPrefs() {
  const { stdout } = await runSidecar(['debug', 'prefs']);
  return JSON.parse(stdout);
}

export async function readMainStatus() {
  const cli = await mainTailscaleCli();
  const { stdout } = await run(cli, ['status', '--json']);
  return JSON.parse(stdout);
}

export async function waitForLaunchdRemoval(label, timeoutMs = 10_000) {
  const target = `gui/${process.getuid()}/${label}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await run('/bin/launchctl', ['print', target], { timeout: 1_000 });
    } catch (error) {
      if (launchdNotFound(error)) return;
      if (error?.killed || error?.signal) {
        continue;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for launchd to remove ${label}`);
}

export async function removeVerifiedStaleSocket(
  socketPath = SIDECAR_SOCKET_PATH,
  {
    probe = readSidecarStatus,
    unlink = fs.unlink,
    lstat = fs.lstat,
  } = {},
) {
  let stat;
  try {
    stat = await lstat(socketPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isSocket()) {
    throw new Error(
      `Refusing to remove non-socket path at ${socketPath}`,
    );
  }
  try {
    await probe();
    throw new Error(
      'A Tailscale daemon still answers on the dedicated socket outside its LaunchAgent',
    );
  } catch (error) {
    if (
      /still answers on the dedicated socket/.test(error?.message || '')
    ) {
      throw error;
    }
    const output = `${error?.message || ''}\n${error?.stderr || ''}\n${
      error?.stdout || ''
    }`;
    if (
      !/connection refused|failed to connect|doesn.t appear to be running|no such file/i.test(
        output,
      )
    ) {
      throw new Error(
        'The dedicated Tailscale socket exists but could not be proven stale',
        { cause: error },
      );
    }
  }
  await unlink(socketPath);
  return true;
}

export async function waitForSidecarResponse({
  readStatus = readSidecarStatus,
  attempts = 50,
  delayMs = 200,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const status = await readStatus();
      if (
        status &&
        typeof status === 'object' &&
        typeof status.BackendState === 'string'
      ) {
        return status;
      }
    } catch {
      // The replacement daemon may still be binding its private socket.
    }
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  throw new Error('The dedicated Tailscale daemon did not answer on its socket');
}

export async function waitForPath(targetPath, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(targetPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${targetPath}`);
}

export async function writePrivateFile(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, contents, {
    mode: 0o600,
    flag: 'wx',
  });
  await fs.rename(temporaryPath, targetPath);
  await fs.chmod(targetPath, 0o600);
}
