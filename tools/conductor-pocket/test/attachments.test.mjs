import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  AttachmentManager,
  detectImageKind,
  normalizeImage,
  readImageUpload,
} from '../src/attachments.mjs';
import { MAX_IMAGE_UPLOAD_BYTES } from '../src/constants.mjs';

const execFileAsync = promisify(execFile);
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const MINIMAL_JPEG = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00,
  0xff,
  0xd9,
]);
const THUMBNAIL_JPEG = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  0x42,
  0xff,
  0xd9,
]);
const POCKET_LEDGER_NAME = '.conductor-pocket.json';

async function makeTemporaryDirectory(context, prefix) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  context.after(() =>
    fs.rm(directory, { recursive: true, force: true }),
  );
  return directory;
}

async function fakeUpload(context, digest = 'source-digest') {
  const temporaryDirectory = await makeTemporaryDirectory(
    context,
    'pocket-upload-fixture-',
  );
  const sourcePath = path.join(temporaryDirectory, 'source.jpg');
  await fs.writeFile(sourcePath, MINIMAL_JPEG, { mode: 0o600 });
  return {
    temporaryDirectory,
    sourcePath,
    bytes: MINIMAL_JPEG.length,
    digest,
    kind: 'jpeg',
  };
}

function fakeNormalizer(upload) {
  return Promise.resolve({
    path: upload.sourcePath,
    bytes: upload.bytes,
    width: 1,
    height: 1,
  });
}

test('image magic detection accepts supported pixels and rejects lookalikes', () => {
  assert.equal(detectImageKind(MINIMAL_JPEG), 'jpeg');
  assert.equal(detectImageKind(ONE_PIXEL_PNG), 'png');
  assert.equal(
    detectImageKind(
      Buffer.from('00000018667479706176696600000000', 'hex'),
    ),
    null,
  );
  assert.equal(detectImageKind(Buffer.from('<svg></svg>')), null);
});

test('raw uploads are streamed with strict size, MIME, and magic validation', async (context) => {
  const temporaryRoot = await makeTemporaryDirectory(
    context,
    'pocket-raw-upload-',
  );
  const imageRequest = Readable.from([ONE_PIXEL_PNG]);
  imageRequest.headers = {
    'content-type': 'image/png',
    'content-length': String(ONE_PIXEL_PNG.length),
    'x-image-name': Buffer.from('../iphone.png').toString('base64url'),
  };
  const upload = await readImageUpload(imageRequest, { temporaryRoot });
  assert.equal(upload.kind, 'png');
  assert.equal(upload.bytes, ONE_PIXEL_PNG.length);
  assert.equal(upload.originalName, 'iphone.png');
  assert.deepEqual(await fs.readFile(upload.sourcePath), ONE_PIXEL_PNG);
  await upload.cleanup();

  const mismatch = Readable.from([ONE_PIXEL_PNG]);
  mismatch.headers = {
    'content-type': 'image/jpeg',
    'content-length': String(ONE_PIXEL_PNG.length),
  };
  await assert.rejects(
    readImageUpload(mismatch, { temporaryRoot }),
    (error) => error.code === 'image_type_unsupported',
  );

  const disguisedSvg = Readable.from([Buffer.from('<svg></svg>')]);
  disguisedSvg.headers = {
    'content-type': 'image/png',
    'content-length': '11',
  };
  await assert.rejects(
    readImageUpload(disguisedSvg, { temporaryRoot }),
    (error) => error.code === 'image_type_unsupported',
  );

  const oversized = Readable.from([]);
  oversized.headers = {
    'content-type': 'image/png',
    'content-length': String(MAX_IMAGE_UPLOAD_BYTES + 1),
  };
  await assert.rejects(
    readImageUpload(oversized, { temporaryRoot }),
    (error) => error.code === 'image_too_large',
  );
  assert.deepEqual(await fs.readdir(temporaryRoot), []);
});

test('attachment staging is private, scoped, idempotent, and keeps hashes internal', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-workspace-',
  );
  const manager = new AttachmentManager({ normalize: fakeNormalizer });
  const upload = await fakeUpload(context);
  const attachment = await manager.upload({
    key: 'device-a:upload-key-123456',
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
    upload,
  });

  assert.match(attachment.id, /^[A-Za-z0-9_-]{6,64}$/);
  assert.equal(attachment.digest, undefined);
  assert.equal(attachment.name, 'image.jpg');
  const directory = path.join(
    workspacePath,
    '.context',
    'attachments',
    attachment.id,
  );
  const storedPath = path.join(directory, 'image.jpg');
  const ledgerPath = path.join(directory, POCKET_LEDGER_NAME);
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(storedPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(ledgerPath)).mode & 0o777, 0o600);
  const ledgerText = await fs.readFile(ledgerPath, 'utf8');
  assert.doesNotMatch(ledgerText, /device-a|session-a/);
  assert.equal(ledgerText.includes(workspacePath), false);
  assert.doesNotMatch(ledgerText, /upload-key-123456/);
  const ledger = JSON.parse(ledgerText);
  assert.equal(ledger.kind, 'conductor-pocket-image');
  assert.equal(ledger.version, 1);
  assert.equal(ledger.retained, false);
  assert.equal(ledger.upload.sourceDigest, 'source-digest');

  const replay = await manager.upload({
    key: 'device-a:upload-key-123456',
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
    upload,
  });
  assert.equal(replay.id, attachment.id);

  const resolved = await manager.resolveForSend(
    [attachment.id],
    {
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath,
    },
  );
  assert.equal(resolved[0].digest, 'source-digest');
  assert.equal(
    resolved[0].relativePath,
    `.context/attachments/${attachment.id}/image.jpg`,
  );
  await assert.rejects(
    manager.resolveForSend(
      [attachment.id],
      {
        deviceId: 'device-b',
        sessionId: 'session-a',
        workspacePath,
      },
    ),
    (error) => error.code === 'attachment_unavailable',
  );
  await assert.rejects(
    manager.resolveForSend(
      [attachment.id],
      {
        deviceId: 'device-a',
        sessionId: 'session-b',
        workspacePath,
      },
    ),
    (error) => error.code === 'attachment_unavailable',
  );
  const movedWorkspacePath = await makeTemporaryDirectory(
    context,
    'pocket-moved-workspace-',
  );
  await assert.rejects(
    manager.resolveForSend(
      [attachment.id],
      {
        deviceId: 'device-a',
        sessionId: 'session-a',
        workspacePath: movedWorkspacePath,
      },
    ),
    (error) => error.code === 'attachment_unavailable',
  );
  await assert.rejects(
    manager.read(attachment.id, {
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath: movedWorkspacePath,
      referencedAttachment: null,
    }),
    (error) => error.code === 'attachment_not_found',
  );

  const image = await manager.read(attachment.id, {
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
    referencedAttachment: null,
  });
  assert.equal(image.contentType, 'image/jpeg');
  assert.deepEqual(image.body, MINIMAL_JPEG);

  const changedUpload = await fakeUpload(context, 'changed-digest');
  await assert.rejects(
    manager.upload({
      key: 'device-a:upload-key-123456',
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath,
      upload: changedUpload,
    }),
    (error) => error.code === 'idempotency_key_reused',
  );

  const scope = {
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
  };
  await manager.retainForSend([attachment.id], scope);
  await assert.rejects(
    manager.remove(attachment.id, scope),
    (error) => error.code === 'attachment_already_sent',
  );
  await manager.releaseAfterUnsent([attachment.id], scope);
  assert.equal(await manager.remove(attachment.id, scope), true);
  await assert.rejects(
    fs.stat(storedPath),
    (error) => error.code === 'ENOENT',
  );
});

test('staged attachments and idempotent retries survive relay restarts', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-restart-workspace-',
  );
  const upload = await fakeUpload(context, 'restart-digest');
  const scope = {
    deviceId: 'device-restart',
    sessionId: 'session-restart',
    workspacePath,
  };
  const first = new AttachmentManager({ normalize: fakeNormalizer });
  const attachment = await first.upload({
    key: 'device-restart:same-upload-key',
    ...scope,
    upload,
  });
  first.stop();

  let normalizationCalls = 0;
  const restarted = new AttachmentManager({
    async normalize(value) {
      normalizationCalls += 1;
      return fakeNormalizer(value);
    },
  });
  const replay = await restarted.upload({
    key: 'device-restart:same-upload-key',
    ...scope,
    upload,
  });
  assert.equal(replay.id, attachment.id);
  assert.equal(normalizationCalls, 0);
  assert.deepEqual(
    (
      await restarted.read(attachment.id, {
        ...scope,
        referencedAttachment: null,
      })
    ).body,
    MINIMAL_JPEG,
  );
  assert.equal(
    (await restarted.resolveForSend([attachment.id], scope))[0].digest,
    'restart-digest',
  );
  await restarted.retainForSend([attachment.id], scope);
  restarted.stop();

  const afterRetainRestart = new AttachmentManager({
    normalize: fakeNormalizer,
  });
  await assert.rejects(
    afterRetainRestart.remove(attachment.id, scope),
    (error) => error.code === 'attachment_already_sent',
  );
  await afterRetainRestart.releaseAfterUnsent(
    [attachment.id],
    scope,
  );
  afterRetainRestart.stop();

  const afterReleaseRestart = new AttachmentManager({
    normalize: fakeNormalizer,
  });
  assert.equal(
    await afterReleaseRestart.remove(attachment.id, scope),
    true,
  );
  afterReleaseRestart.stop();
});

test('multi-image retention preflights every ledger and cannot strand a partial send', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-retention-transaction-',
  );
  const manager = new AttachmentManager({
    normalize: fakeNormalizer,
    async beforeLedgerPrepare({ phase, index }) {
      if (phase === 'update' && index === 1) {
        throw new Error('injected-ledger-preflight-failure');
      }
    },
  });
  const scope = {
    deviceId: 'device-transaction',
    sessionId: 'session-transaction',
    workspacePath,
  };
  const attachments = [];
  for (let index = 0; index < 2; index += 1) {
    attachments.push(
      await manager.upload({
        key: `device-transaction:key-${index}`,
        ...scope,
        upload: await fakeUpload(context, `transaction-${index}`),
      }),
    );
  }
  const root = path.join(workspacePath, '.context', 'attachments');
  await assert.rejects(
    manager.retainForSend(
      attachments.map(({ id }) => id),
      scope,
    ),
    /injected-ledger-preflight-failure/,
  );
  const firstLedger = JSON.parse(
    await fs.readFile(
      path.join(root, attachments[0].id, POCKET_LEDGER_NAME),
      'utf8',
    ),
  );
  assert.equal(firstLedger.retained, false);
  for (const { id } of attachments) {
    assert.equal(await manager.remove(id, scope), true);
  }
  manager.stop();
});

test('thumbnail variants persist across restart and safely fall back to full images', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-thumbnail-workspace-',
  );
  const upload = await fakeUpload(context, 'thumbnail-digest');
  const thumbnailPath = path.join(
    upload.temporaryDirectory,
    'fixture-thumbnail.jpg',
  );
  await fs.writeFile(thumbnailPath, THUMBNAIL_JPEG, { mode: 0o600 });
  const scope = {
    deviceId: 'device-thumbnail',
    sessionId: 'session-thumbnail',
    workspacePath,
  };
  const manager = new AttachmentManager({
    async normalize(value) {
      return {
        ...(await fakeNormalizer(value)),
        thumbnail: {
          path: thumbnailPath,
          bytes: THUMBNAIL_JPEG.length,
          width: 1,
          height: 1,
        },
      };
    },
  });
  const attachment = await manager.upload({
    key: 'device-thumbnail:key',
    ...scope,
    upload,
  });
  manager.stop();

  const restarted = new AttachmentManager({
    normalize: fakeNormalizer,
  });
  const thumbnail = await restarted.read(attachment.id, {
    ...scope,
    referencedAttachment: null,
    variant: 'thumbnail',
  });
  assert.equal(thumbnail.name, 'thumbnail.jpg');
  assert.deepEqual(thumbnail.body, THUMBNAIL_JPEG);

  const withoutThumbnail = await restarted.upload({
    key: 'device-thumbnail:no-thumbnail',
    ...scope,
    upload: await fakeUpload(context, 'no-thumbnail'),
  });
  const fallback = await restarted.read(withoutThumbnail.id, {
    ...scope,
    referencedAttachment: null,
    variant: 'thumbnail',
  });
  assert.equal(fallback.name, 'image.jpg');
  assert.deepEqual(fallback.body, MINIMAL_JPEG);
  restarted.stop();
});

test('previews verify only the requested image while sends verify full pixels', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-selective-verification-',
  );
  const upload = await fakeUpload(context, 'selective-digest');
  const thumbnailPath = path.join(
    upload.temporaryDirectory,
    'fixture-thumbnail.jpg',
  );
  await fs.writeFile(thumbnailPath, THUMBNAIL_JPEG, { mode: 0o600 });
  const scope = {
    deviceId: 'device-selective',
    sessionId: 'session-selective',
    workspacePath,
  };
  const manager = new AttachmentManager({
    async normalize(value) {
      return {
        ...(await fakeNormalizer(value)),
        thumbnail: {
          path: thumbnailPath,
          bytes: THUMBNAIL_JPEG.length,
          width: 1,
          height: 1,
        },
      };
    },
  });
  const attachment = await manager.upload({
    key: 'device-selective:key',
    ...scope,
    upload,
  });
  manager.stop();

  const directory = path.join(
    workspacePath,
    '.context',
    'attachments',
    attachment.id,
  );
  const fullPath = path.join(directory, 'image.jpg');
  const storedThumbnailPath = path.join(directory, 'thumbnail.jpg');
  const tamperedFull = Buffer.from(MINIMAL_JPEG);
  tamperedFull[10] ^= 0x01;
  await fs.writeFile(fullPath, tamperedFull, { mode: 0o600 });

  const restarted = new AttachmentManager({
    normalize: fakeNormalizer,
  });
  assert.deepEqual(
    (
      await restarted.read(attachment.id, {
        ...scope,
        referencedAttachment: null,
        variant: 'thumbnail',
      })
    ).body,
    THUMBNAIL_JPEG,
  );
  assert.equal(
    (await restarted.resolveForSend([attachment.id], scope))[0].id,
    attachment.id,
  );
  await assert.rejects(
    restarted.retainForSend([attachment.id], scope),
    (error) => error.code === 'attachment_unavailable',
  );
  await assert.rejects(
    restarted.read(attachment.id, {
      ...scope,
      referencedAttachment: null,
      variant: 'full',
    }),
    (error) => error.code === 'attachment_not_found',
  );

  await fs.writeFile(fullPath, MINIMAL_JPEG, { mode: 0o600 });
  const tamperedThumbnail = Buffer.from(THUMBNAIL_JPEG);
  tamperedThumbnail[10] ^= 0x01;
  await fs.writeFile(storedThumbnailPath, tamperedThumbnail, {
    mode: 0o600,
  });
  assert.deepEqual(
    (
      await restarted.read(attachment.id, {
        ...scope,
        referencedAttachment: null,
        variant: 'full',
      })
    ).body,
    MINIMAL_JPEG,
  );
  await assert.rejects(
    restarted.read(attachment.id, {
      ...scope,
      referencedAttachment: null,
      variant: 'thumbnail',
    }),
    (error) => error.code === 'attachment_not_found',
  );
  restarted.stop();
});

test('device purge survives restart and preserves retained and other-device images', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-purge-workspace-',
  );
  const manager = new AttachmentManager({ normalize: fakeNormalizer });
  const deviceScope = {
    deviceId: 'device-purge',
    sessionId: 'session-purge',
    workspacePath,
  };
  const staged = await manager.upload({
    key: 'device-purge:staged',
    ...deviceScope,
    upload: await fakeUpload(context, 'purge-staged'),
  });
  const retained = await manager.upload({
    key: 'device-purge:retained',
    ...deviceScope,
    upload: await fakeUpload(context, 'purge-retained'),
  });
  await manager.retainForSend([retained.id], deviceScope);
  const other = await manager.upload({
    key: 'device-other:staged',
    deviceId: 'device-other',
    sessionId: 'session-other',
    workspacePath,
    upload: await fakeUpload(context, 'purge-other'),
  });
  manager.stop();

  const restarted = new AttachmentManager({
    normalize: fakeNormalizer,
  });
  assert.equal(
    await restarted.purgeDevice('device-purge', {
      workspacePaths: [
        '/definitely/missing/pocket/workspace',
        workspacePath,
      ],
    }),
    1,
  );
  const root = path.join(workspacePath, '.context', 'attachments');
  await assert.rejects(
    fs.stat(path.join(root, staged.id)),
    (error) => error.code === 'ENOENT',
  );
  assert.equal((await fs.stat(path.join(root, retained.id))).isDirectory(), true);
  assert.equal((await fs.stat(path.join(root, other.id))).isDirectory(), true);
  restarted.stop();
});

test('device revocation fences in-flight uploads before its final purge', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-revocation-fence-',
  );
  let signalNormalizationStarted;
  let allowNormalization;
  const normalizationStarted = new Promise((resolve) => {
    signalNormalizationStarted = resolve;
  });
  const normalizationAllowed = new Promise((resolve) => {
    allowNormalization = resolve;
  });
  const manager = new AttachmentManager({
    async normalize(upload) {
      signalNormalizationStarted();
      await normalizationAllowed;
      return fakeNormalizer(upload);
    },
  });
  const scope = {
    deviceId: 'device-revoked',
    sessionId: 'session-revoked',
    workspacePath,
  };
  const upload = await fakeUpload(context, 'revoked-in-flight');
  const uploadPromise = manager.upload({
    key: 'device-revoked:in-flight',
    ...scope,
    upload,
  });
  await normalizationStarted;

  let purgeFinished = false;
  const purgePromise = manager
    .purgeDevice(scope.deviceId, {
      workspacePaths: [workspacePath],
    })
    .then((removed) => {
      purgeFinished = true;
      return removed;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(purgeFinished, false);

  allowNormalization();
  const attachment = await uploadPromise;
  assert.equal(await purgePromise, 1);
  await assert.rejects(
    fs.stat(
      path.join(
        workspacePath,
        '.context',
        'attachments',
        attachment.id,
      ),
    ),
    (error) => error.code === 'ENOENT',
  );
  await assert.rejects(
    manager.upload({
      key: 'device-revoked:after-purge',
      ...scope,
      upload: await fakeUpload(context, 'revoked-after-purge'),
    }),
    (error) => error.code === 'device_revoked',
  );
  manager.stop();
});

test('device purge rechecks retention after a concurrent safe release', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-revocation-release-',
  );
  let blockRelease = false;
  let signalReleaseStarted;
  let allowRelease;
  const releaseStarted = new Promise((resolve) => {
    signalReleaseStarted = resolve;
  });
  const releaseAllowed = new Promise((resolve) => {
    allowRelease = resolve;
  });
  const manager = new AttachmentManager({
    normalize: fakeNormalizer,
    async beforeLedgerPrepare({ phase }) {
      if (!blockRelease || phase !== 'update') return;
      signalReleaseStarted();
      await releaseAllowed;
    },
  });
  const scope = {
    deviceId: 'device-release-race',
    sessionId: 'session-release-race',
    workspacePath,
  };
  const attachment = await manager.upload({
    key: 'device-release-race:key',
    ...scope,
    upload: await fakeUpload(context, 'release-race'),
  });
  await manager.retainForSend([attachment.id], scope);

  blockRelease = true;
  const releasePromise = manager.releaseAfterUnsent(
    [attachment.id],
    scope,
  );
  await releaseStarted;
  const purgePromise = manager.purgeDevice(scope.deviceId, {
    workspacePaths: [workspacePath],
  });
  allowRelease();
  await releasePromise;
  assert.equal(await purgePromise, 1);
  await assert.rejects(
    fs.stat(
      path.join(
        workspacePath,
        '.context',
        'attachments',
        attachment.id,
      ),
    ),
    (error) => error.code === 'ENOENT',
  );
  manager.stop();
});

test('janitor deletes only aged Pocket claims and fails closed on ledger tampering', async (context) => {
  let now = 1_900_000_000_000;
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-ledger-tamper-',
  );
  const manager = new AttachmentManager({
    now: () => now,
    normalize: fakeNormalizer,
  });
  const scope = {
    deviceId: 'device-tamper',
    sessionId: 'session-tamper',
    workspacePath,
  };
  const tampered = await manager.upload({
    key: 'device-tamper:tampered',
    ...scope,
    upload: await fakeUpload(context, 'tampered'),
  });
  const crashed = await manager.upload({
    key: 'device-tamper:crashed',
    ...scope,
    upload: await fakeUpload(context, 'crashed'),
  });
  manager.stop();

  const root = path.join(workspacePath, '.context', 'attachments');
  const tamperedDirectory = path.join(root, tampered.id);
  await fs.writeFile(
    path.join(tamperedDirectory, POCKET_LEDGER_NAME),
    '{}\n',
    { mode: 0o600 },
  );
  const crashedDirectory = path.join(root, crashed.id);
  const claimPath = path.join(
    crashedDirectory,
    POCKET_LEDGER_NAME,
  );
  const claim = JSON.parse(await fs.readFile(claimPath, 'utf8'));
  claim.state = 'creating';
  claim.expiresAt = now - 1;
  await fs.writeFile(claimPath, `${JSON.stringify(claim)}\n`, {
    mode: 0o600,
  });
  await fs.unlink(path.join(crashedDirectory, 'image.jpg'));

  const nativeDirectory = path.join(root, 'NATIVE2');
  await fs.mkdir(nativeDirectory, { mode: 0o700 });
  await fs.writeFile(
    path.join(nativeDirectory, 'image.jpg'),
    MINIMAL_JPEG,
    { mode: 0o600 },
  );
  const restarted = new AttachmentManager({
    now: () => now,
    normalize: fakeNormalizer,
  });
  await restarted.sweepWorkspaces([workspacePath]);
  await assert.rejects(
    fs.stat(crashedDirectory),
    (error) => error.code === 'ENOENT',
  );
  assert.equal((await fs.stat(tamperedDirectory)).isDirectory(), true);
  assert.equal((await fs.stat(nativeDirectory)).isDirectory(), true);
  assert.equal(
    await restarted.purgeDevice('device-tamper', {
      workspacePaths: [workspacePath],
    }),
    0,
  );
  assert.equal((await fs.stat(tamperedDirectory)).isDirectory(), true);
  restarted.stop();
});

test('image normalization is capped at two concurrent Mac processes', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-normalization-limit-',
  );
  let active = 0;
  let maximumActive = 0;
  const manager = new AttachmentManager({
    async normalize(upload) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return fakeNormalizer(upload);
    },
  });
  await Promise.all(
    Array.from({ length: 4 }, async (_value, index) =>
      manager.upload({
        key: `device-a:parallel-${index}`,
        deviceId: 'device-a',
        sessionId: 'session-a',
        workspacePath,
        upload: await fakeUpload(context, `digest-${index}`),
      }),
    ),
  );
  assert.equal(maximumActive, 2);
});

test('concurrent uploads cannot race past the staged device quota', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-staged-quota-',
  );
  const secondWorkspacePath = await makeTemporaryDirectory(
    context,
    'pocket-staged-quota-second-',
  );
  let now = 1_800_000_000_000;
  const manager = new AttachmentManager({
    now: () => now,
    async normalize(upload) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await fs.truncate(upload.sourcePath, 8 * 1024 * 1024);
      return {
        ...(await fakeNormalizer(upload)),
        bytes: 8 * 1024 * 1024,
      };
    },
  });
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, async (_value, index) => {
      const targetWorkspace =
        index % 2 === 0 ? workspacePath : secondWorkspacePath;
      return {
        ...(await manager.upload({
        key: `device-a:quota-${index}`,
        deviceId: 'device-a',
        sessionId: 'session-a',
        workspacePath: targetWorkspace,
        upload: await fakeUpload(context, `quota-digest-${index}`),
        })),
        workspacePath: targetWorkspace,
      };
    }),
  );
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    5,
  );
  const rejection = results.find(
    ({ status }) => status === 'rejected',
  );
  assert.equal(rejection.reason.code, 'image_quota_exceeded');

  const nativeId = 'NATIVE1';
  const nativeDirectory = path.join(
    workspacePath,
    '.context',
    'attachments',
    nativeId,
  );
  await fs.mkdir(nativeDirectory, { mode: 0o700 });
  await fs.writeFile(
    path.join(nativeDirectory, 'image.jpg'),
    MINIMAL_JPEG,
    { mode: 0o600 },
  );
  manager.stop();

  let restartNormalizations = 0;
  const restarted = new AttachmentManager({
    now: () => now,
    async normalize(upload) {
      restartNormalizations += 1;
      return fakeNormalizer(upload);
    },
  });
  await assert.rejects(
    restarted.upload({
      key: 'device-a:restart-quota',
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath,
      workspacePaths: [workspacePath, secondWorkspacePath],
      upload: await fakeUpload(context, 'restart-quota'),
    }),
    (error) => error.code === 'image_quota_exceeded',
  );
  assert.equal(restartNormalizations, 0);

  now += 24 * 60 * 60 * 1000 + 1;
  const afterExpiry = await restarted.upload({
    key: 'device-a:after-expiry',
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
    upload: await fakeUpload(context, 'after-expiry'),
  });
  assert.ok(afterExpiry.id);
  assert.equal(restartNormalizations, 1);
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    await assert.rejects(
      fs.stat(
          path.join(
          result.value.workspacePath,
          '.context',
          'attachments',
          result.value.id,
        ),
      ),
      (error) => error.code === 'ENOENT',
    );
  }
  assert.equal((await fs.stat(nativeDirectory)).isDirectory(), true);
  restarted.stop();
});

test('workspace and stored-image symlinks fail closed', async (context) => {
  const workspacePath = await makeTemporaryDirectory(
    context,
    'pocket-workspace-',
  );
  const outside = await makeTemporaryDirectory(
    context,
    'pocket-outside-',
  );
  await fs.symlink(outside, path.join(workspacePath, '.context'));
  const manager = new AttachmentManager({ normalize: fakeNormalizer });
  await assert.rejects(
    manager.upload({
      key: 'device-a:upload-key-symlink',
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath,
      upload: await fakeUpload(context),
    }),
    (error) => error.code === 'workspace_path_unavailable',
  );

  const safeWorkspace = await makeTemporaryDirectory(
    context,
    'pocket-safe-workspace-',
  );
  const attachment = await manager.upload({
    key: 'device-a:upload-key-safe',
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath: safeWorkspace,
    upload: await fakeUpload(context, 'safe-digest'),
  });
  const storedPath = path.join(
    safeWorkspace,
    '.context',
    'attachments',
    attachment.id,
    'image.jpg',
  );
  const outsideImage = path.join(outside, 'outside.jpg');
  await fs.writeFile(outsideImage, MINIMAL_JPEG);
  await fs.unlink(storedPath);
  await fs.symlink(outsideImage, storedPath);
  await assert.rejects(
    manager.read(attachment.id, {
      deviceId: 'device-a',
      sessionId: 'session-a',
      workspacePath: safeWorkspace,
      referencedAttachment: null,
    }),
    (error) => error.code === 'attachment_not_found',
  );
});

test('Mac normalization uses a pixel-only round trip that removes embedded metadata', {
  skip: process.platform !== 'darwin',
}, async (context) => {
  const temporaryDirectory = await makeTemporaryDirectory(
    context,
    'pocket-normalize-',
  );
  const pngPath = path.join(temporaryDirectory, 'source.png');
  const sourcePath = path.join(temporaryDirectory, 'source.jpg');
  await fs.writeFile(pngPath, ONE_PIXEL_PNG);
  await execFileAsync('/usr/bin/sips', [
    '-s',
    'format',
    'jpeg',
    pngPath,
    '--out',
    sourcePath,
  ]);
  await execFileAsync('/usr/bin/sips', [
    '--setProperty',
    'copyright',
    'TOP-SECRET-METADATA',
    sourcePath,
  ]);
  const before = await execFileAsync('/usr/bin/sips', [
    '-g',
    'copyright',
    sourcePath,
  ]);
  assert.match(before.stdout, /TOP-SECRET-METADATA/);

  const normalized = await normalizeImage({
    temporaryDirectory,
    sourcePath,
  });
  assert.equal(detectImageKind(await fs.readFile(normalized.path)), 'jpeg');
  const after = await execFileAsync('/usr/bin/sips', [
    '-g',
    'copyright',
    normalized.path,
  ]);
  assert.doesNotMatch(after.stdout, /TOP-SECRET-METADATA/);
  assert.ok(normalized.width <= 2560);
  assert.ok(normalized.height <= 2560);
});
