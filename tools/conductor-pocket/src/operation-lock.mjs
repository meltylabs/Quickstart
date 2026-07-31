import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomToken } from './encoding.mjs';

const LOCKF_PATH = '/usr/bin/lockf';
const FLOCK_PATH = '/usr/bin/flock';
const CAT_PATH = '/bin/cat';
const RECOVERY_READY = 'conductor-pocket-recovery-ready\n';

export const DEFAULT_OPERATION_LOCK_PATH = path.join(
  os.homedir(),
  '.config',
  'conductor-pocket',
  'operation.lock',
);

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function readExistingLock(lockPath) {
  const handle = await fs.open(lockPath, 'r');
  try {
    const [stat, contents] = await Promise.all([
      handle.stat(),
      handle.readFile('utf8'),
    ]);
    let owner = null;
    try {
      owner = JSON.parse(contents);
    } catch {
      // A just-created file can be observed before its owner record is written.
    }
    return { stat, owner };
  } finally {
    await handle.close();
  }
}

async function writeOwner(lockPath, owner) {
  const handle = await fs.open(lockPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
  } finally {
    await handle.close();
  }
  await fs.chmod(lockPath, 0o600);
}

function recoveryLockPath(lockPath) {
  return `${lockPath}.recovery`;
}

export function recoveryLockCommandForPlatform(platform, recoveryPath) {
  if (platform === 'darwin') {
    return {
      command: LOCKF_PATH,
      args: ['-s', '-t', '0', '-k', recoveryPath, CAT_PATH],
    };
  }
  if (platform === 'linux') {
    return {
      command: FLOCK_PATH,
      args: ['-x', '-n', '-E', '75', '-F', recoveryPath, CAT_PATH],
    };
  }
  throw new Error(
    `Conductor Pocket operation locking is unsupported on ${platform}`,
  );
}

function observeProcess(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once('error', (error) => finish({ error }));
    child.once('exit', (code, signal) => finish({ code, signal }));
  });
}

function waitForProcess(finished, timeoutMs) {
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

async function acquireRecoveryLock(lockPath) {
  const recoveryPath = recoveryLockPath(lockPath);
  const invocation = recoveryLockCommandForPlatform(
    process.platform,
    recoveryPath,
  );
  const child = spawn(invocation.command, invocation.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.on('error', () => {});
  child.stderr.resume();
  const finished = observeProcess(child);
  let output = '';
  const ready = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeListener('data', onData);
      callback(value);
    };
    const onData = (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > RECOVERY_READY.length) {
        finish(
          reject,
          new Error('The Conductor Pocket recovery lock returned unexpected output'),
        );
      } else if (output === RECOVERY_READY) {
        finish(resolve);
      }
    };
    const timer = setTimeout(
      () =>
        finish(
          reject,
          new Error('Timed out acquiring the Conductor Pocket recovery lock'),
        ),
      5_000,
    );
    child.stdout.on('data', onData);
    finished.then((result) => {
      if (settled) return;
      if (result?.code === 75) {
        finish(
          reject,
          new Error('Another Conductor Pocket lock recovery is active'),
        );
      } else {
        finish(
          reject,
          new Error('Could not acquire the Conductor Pocket recovery lock'),
        );
      }
    });
  });
  child.stdin.write(RECOVERY_READY);
  try {
    await ready;
  } catch (error) {
    if (!child.killed) child.kill('SIGKILL');
    await waitForProcess(finished, 2_000);
    throw error;
  }
  try {
    await fs.chmod(recoveryPath, 0o600);
  } catch (error) {
    child.stdin.end();
    const stopped = await waitForProcess(finished, 2_000);
    if (stopped.timedOut) child.kill('SIGKILL');
    throw error;
  }
  return { child, finished, recoveryPath };
}

async function releaseRecoveryLock(recoveryLock) {
  recoveryLock.child.stdin.end();
  let stopped = await waitForProcess(recoveryLock.finished, 5_000);
  if (stopped.timedOut) {
    recoveryLock.child.kill('SIGKILL');
    stopped = await waitForProcess(recoveryLock.finished, 2_000);
    if (stopped.timedOut) {
      throw new Error('The Conductor Pocket recovery lock did not release');
    }
  }
  if (
    stopped.result?.error ||
    stopped.result?.signal ||
    stopped.result?.code !== 0
  ) {
    throw new Error('The Conductor Pocket recovery lock exited unexpectedly');
  }
}

async function acquireOperationLock(lockPath, operation) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(lockPath), 0o700);
  const token = randomToken(18);
  const owner = {
    pid: process.pid,
    token,
    operation,
    startedAt: new Date().toISOString(),
  };
  try {
    await writeOwner(lockPath, owner);
    return owner;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const recoveryLock = await acquireRecoveryLock(lockPath);
  try {
    let existing;
    try {
      existing = await readExistingLock(lockPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        try {
          await writeOwner(lockPath, owner);
          return owner;
        } catch (writeError) {
          if (writeError?.code !== 'EEXIST') throw writeError;
          existing = await readExistingLock(lockPath);
        }
      } else {
        throw error;
      }
    }

    const ageMs = Date.now() - existing.stat.mtimeMs;
    if (
      processIsAlive(existing.owner?.pid) ||
      (!existing.owner && ageMs < 30_000)
    ) {
      throw new Error(
        `Another Conductor Pocket operation is active${
          existing.owner?.operation ? `: ${existing.owner.operation}` : ''
        }`,
      );
    }
    const current = await fs.lstat(lockPath);
    if (
      current.dev !== existing.stat.dev ||
      current.ino !== existing.stat.ino ||
      !current.isFile()
    ) {
      throw new Error('Conductor Pocket operation lock changed during recovery');
    }
    await fs.unlink(lockPath);
    try {
      await writeOwner(lockPath, owner);
      return owner;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(
          'Another Conductor Pocket operation acquired the recovered lock',
        );
      }
      throw error;
    }
  } finally {
    await releaseRecoveryLock(recoveryLock);
  }
}

async function releaseOperationLock(lockPath, owner) {
  let existing;
  try {
    existing = await readExistingLock(lockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (
    existing.owner?.pid !== owner.pid ||
    existing.owner?.token !== owner.token
  ) {
    throw new Error('Conductor Pocket operation lock ownership changed');
  }
  await fs.unlink(lockPath);
}

export async function withOperationLock(
  operation,
  task,
  lockPath = DEFAULT_OPERATION_LOCK_PATH,
) {
  if (!path.isAbsolute(lockPath)) {
    throw new TypeError('Conductor Pocket operation lock path must be absolute');
  }
  const owner = await acquireOperationLock(lockPath, operation);
  try {
    return await task();
  } finally {
    await releaseOperationLock(lockPath, owner);
  }
}
