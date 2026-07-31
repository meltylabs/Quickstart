import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  recoveryLockCommandForPlatform,
  withOperationLock,
} from '../src/operation-lock.mjs';

test('recovery lock selects exact crash-releasing platform primitives', () => {
  const recoveryPath = '/private/recovery.lock';
  assert.deepEqual(recoveryLockCommandForPlatform('darwin', recoveryPath), {
    command: '/usr/bin/lockf',
    args: ['-s', '-t', '0', '-k', recoveryPath, '/bin/cat'],
  });
  assert.deepEqual(recoveryLockCommandForPlatform('linux', recoveryPath), {
    command: '/usr/bin/flock',
    args: ['-x', '-n', '-E', '75', '-F', recoveryPath, '/bin/cat'],
  });
  assert.throws(
    () => recoveryLockCommandForPlatform('win32', recoveryPath),
    /operation locking is unsupported on win32/,
  );
});

test('operation locks reject relative paths before changing the filesystem', async () => {
  await assert.rejects(
    withOperationLock('unsafe relative lock', async () => {}, 'relative.lock'),
    /operation lock path must be absolute/,
  );
});

test('global operation lock serializes active mutations', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-lock-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'operation.lock');
  let release;
  const held = withOperationLock(
    'first mutation',
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    lockPath,
  );
  while (!release) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  await assert.rejects(
    withOperationLock('second mutation', async () => {}, lockPath),
    /Another Conductor Pocket operation is active: first mutation/,
  );
  release();
  await held;
  await assert.doesNotReject(
    withOperationLock('third mutation', async () => {}, lockPath),
  );
});

test('global operation lock reclaims a verified dead owner', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-stale-lock-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'operation.lock');
  await fs.writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: 'stale',
      operation: 'crashed operation',
      startedAt: '2026-01-01T00:00:00.000Z',
    })}\n`,
    { mode: 0o600 },
  );

  let ran = false;
  await withOperationLock(
    'replacement operation',
    async () => {
      ran = true;
    },
    lockPath,
  );
  assert.equal(ran, true);
  await assert.rejects(fs.access(lockPath), (error) => error.code === 'ENOENT');
});

test('stale-lock recovery admits only one concurrent replacement', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-contended-stale-lock-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'operation.lock');
  await fs.writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: 'stale',
      operation: 'crashed operation',
      startedAt: '2026-01-01T00:00:00.000Z',
    })}\n`,
    { mode: 0o600 },
  );

  let active = 0;
  let maximumActive = 0;
  const contenders = Array.from({ length: 20 }, (_, index) =>
    withOperationLock(
      `replacement ${index}`,
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      },
      lockPath,
    ),
  );
  const results = await Promise.allSettled(contenders);
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  assert.equal(maximumActive, 1);
  await assert.rejects(fs.access(lockPath), (error) => error.code === 'ENOENT');
  assert.equal((await fs.stat(`${lockPath}.recovery`)).mode & 0o077, 0);
});

test('an unlocked persistent recovery file never counts as ownership', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-stale-recovery-lock-'),
  );
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, 'operation.lock');
  await fs.writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: 'stale',
      operation: 'crashed operation',
      startedAt: '2026-01-01T00:00:00.000Z',
    })}\n`,
    { mode: 0o600 },
  );
  await fs.writeFile(`${lockPath}.recovery`, 'persistent advisory lock\n', {
    mode: 0o600,
  });

  await assert.doesNotReject(
    withOperationLock('replacement operation', async () => {}, lockPath),
  );
  assert.equal((await fs.stat(`${lockPath}.recovery`)).mode & 0o077, 0);
});
