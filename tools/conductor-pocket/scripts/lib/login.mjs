import { spawn } from 'node:child_process';
import {
  readSidecarStatus,
  run,
  sidecarCliArguments,
  sidecarLoginOutcome,
  validatedSidecarAuthUrl,
  waitForSidecarLoginOutcome,
} from './sidecar.mjs';

export const DESIRED_SIDECAR_SETTINGS = Object.freeze([
  '--reset',
  '--hostname=conductor-pocket',
  '--accept-dns=false',
  '--accept-routes=false',
  '--shields-up=false',
  '--ssh=false',
  '--advertise-exit-node=false',
  '--advertise-routes=',
  '--advertise-tags=',
  '--advertise-connector=false',
  '--exit-node=',
  '--exit-node-allow-lan-access=false',
  '--report-posture=false',
]);

export function sidecarUpArguments({ json = false } = {}) {
  return sidecarCliArguments([
    'up',
    ...(json ? ['--json'] : []),
    '--timeout=25s',
    ...DESIRED_SIDECAR_SETTINGS,
  ]);
}

function observeChild(child) {
  const observation = { result: null };
  const finished = new Promise((resolve) => {
    const finish = (result) => {
      if (observation.result) return;
      observation.result = result;
      resolve(result);
    };
    child.once('error', (error) => finish({ error }));
    child.once('exit', (code, signal) => finish({ code, signal }));
  });
  return { observation, finished };
}

export function startLoginRequest(
  cli,
  { spawnProcess = spawn } = {},
) {
  const argumentsList = sidecarUpArguments({ json: true });
  const child = spawnProcess(cli, argumentsList, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  return {
    child,
    argumentsList,
    ...observeChild(child),
  };
}

function waitForFinished(finished, timeoutMs) {
  const timeout = Symbol('timeout');
  let timer;
  return Promise.race([
    finished,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(timeout), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer)).then((result) => ({
    timedOut: result === timeout,
    result: result === timeout ? null : result,
  }));
}

export async function stopLoginRequest(
  request,
  { terminateTimeoutMs = 2_000, killTimeoutMs = 2_000 } = {},
) {
  if (request.observation.result) return request.observation.result;
  request.child.kill('SIGTERM');
  let stopped = await waitForFinished(
    request.finished,
    terminateTimeoutMs,
  );
  if (!stopped.timedOut) return stopped.result;

  request.child.kill('SIGKILL');
  stopped = await waitForFinished(request.finished, killTimeoutMs);
  if (!stopped.timedOut) return stopped.result;
  throw new Error(
    'The temporary Tailscale login helper did not exit after SIGTERM and SIGKILL',
  );
}

function childFailure(result) {
  if (result?.error) {
    return new Error('The temporary Tailscale login helper could not start');
  }
  if (result?.signal) {
    return new Error(
      `The temporary Tailscale login helper stopped unexpectedly with ${result.signal}`,
    );
  }
  return new Error(
    `The temporary Tailscale login helper exited before authorization${
      Number.isInteger(result?.code) ? ` (status ${result.code})` : ''
    }`,
  );
}

async function finalLoginOutcome({
  readStatus,
  deadlineMs = 3_000,
  statusTimeoutMs = 1_500,
}) {
  try {
    return await waitForSidecarLoginOutcome({
      readStatus,
      deadlineMs,
      statusTimeoutMs,
      pollDelayMs: 100,
    });
  } catch {
    return null;
  }
}

function sameDurableOutcome(expected, actual) {
  if (!actual) return false;
  if (actual.status.BackendState === 'Running') return true;
  return Boolean(expected.authUrl && actual.authUrl === expected.authUrl);
}

export async function requestSidecarLogin(
  cli,
  {
    spawnProcess = spawn,
    readStatus = readSidecarStatus,
    loginDeadlineMs = 20_000,
    statusTimeoutMs = 2_000,
    terminateTimeoutMs = 2_000,
    killTimeoutMs = 2_000,
    finalDeadlineMs = 3_000,
    finalStatusTimeoutMs = 1_500,
  } = {},
) {
  const request = startLoginRequest(cli, { spawnProcess });
  const controller = new AbortController();
  const statusObservation = waitForSidecarLoginOutcome({
    readStatus,
    deadlineMs: loginDeadlineMs,
    statusTimeoutMs,
    signal: controller.signal,
  }).then(
    (outcome) => ({ type: 'status', outcome }),
    (error) => ({ type: 'status-error', error }),
  );
  const childObservation = request.finished.then((result) => ({
    type: 'child',
    result,
  }));
  const first = await Promise.race([
    statusObservation,
    childObservation,
  ]);

  let outcome = first.type === 'status' ? first.outcome : null;
  let primaryError =
    first.type === 'status-error'
      ? first.error
      : first.type === 'child'
        ? childFailure(first.result)
        : null;
  if (first.type !== 'status') {
    controller.abort();
    outcome = await finalLoginOutcome({
      readStatus,
      deadlineMs: finalDeadlineMs,
      statusTimeoutMs: finalStatusTimeoutMs,
    });
  }

  let cleanupError = null;
  try {
    await stopLoginRequest(request, {
      terminateTimeoutMs,
      killTimeoutMs,
    });
  } catch (error) {
    cleanupError = error;
  }
  controller.abort();

  if (!outcome) {
    if (cleanupError) {
      throw new AggregateError(
        [primaryError, cleanupError].filter(Boolean),
        'The Tailscale login request failed and its helper could not be cleaned up',
      );
    }
    throw (
      primaryError ||
      new Error('The dedicated Tailscale daemon did not start authorization')
    );
  }
  if (cleanupError) throw cleanupError;

  const confirmed = await finalLoginOutcome({
    readStatus,
    deadlineMs: finalDeadlineMs,
    statusTimeoutMs: finalStatusTimeoutMs,
  });
  if (!sameDurableOutcome(outcome, confirmed)) {
    throw new Error(
      'The dedicated Tailscale daemon did not retain authorization after the helper exited',
    );
  }
  return confirmed;
}

export async function presentSidecarLogin(
  outcome,
  {
    printUrl = false,
    openBrowser = (url) =>
      run('/usr/bin/open', [url], { timeout: 5_000 }),
    write = (value) => process.stdout.write(value),
  } = {},
) {
  if (outcome.status.BackendState === 'Running') {
    write(`Dedicated Conductor Pocket Tailscale node is authenticated.

Next: npm run sidecar:cutover
`);
    return;
  }
  const authUrl = validatedSidecarAuthUrl(outcome.authUrl);
  if (!authUrl) {
    throw new Error('The dedicated Tailscale login outcome has no authorization URL');
  }
  if (printUrl) {
    write(`Dedicated Conductor Pocket Tailscale approval is pending.

Open this private one-time URL immediately:
${authUrl}

The login helper has exited safely; the dedicated daemon keeps the request.
After approval, rerun: npm run sidecar:login
`);
    return;
  }
  try {
    await openBrowser(authUrl);
  } catch {
    throw new Error(
      'Could not open the private Tailscale approval in the Mac browser. Rerun: npm run sidecar:login -- --print-url',
    );
  }
  write(`Tailscale approval opened in the Mac browser.

The one-time URL was not written to this transcript.
After approval, rerun: npm run sidecar:login
`);
}
