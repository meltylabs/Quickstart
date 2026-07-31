import { constants as filesystemConstants } from 'node:fs';
import fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_OUTPUT_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_UPLOAD_BYTES,
} from './constants.mjs';
import { validAttachmentId } from './attachment-markup.mjs';
import { HttpError } from './errors.mjs';

const execFileAsync = promisify(execFile);
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const UNUSED_ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 24;
const MAX_CONCURRENT_NORMALIZATIONS = 2;
const STAGED_DEVICE_BYTES = 40 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 16_384;
const THUMBNAIL_DIMENSION = 640;
const POCKET_LEDGER_NAME = '.conductor-pocket.json';
const POCKET_LEDGER_KIND = 'conductor-pocket-image';
const POCKET_LEDGER_VERSION = 1;
const MAX_LEDGER_BYTES = 16 * 1024;
const JANITOR_INTERVAL_MS = 5 * 60 * 1000;
const HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SALT_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SAFE_DIGEST_PATTERN = /^[A-Za-z0-9_.-]{1,160}$/;
const LEDGER_TEMP_PATTERN =
  /^\.conductor-pocket\.json\.[A-Za-z0-9_-]{12,64}\.tmp$/;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
]);
const CONTENT_TYPES_BY_KIND = new Map([
  ['jpeg', new Set(['application/octet-stream', 'image/jpeg'])],
  ['png', new Set(['application/octet-stream', 'image/png'])],
  [
    'heic',
    new Set([
      'application/octet-stream',
      'image/heic',
      'image/heif',
    ]),
  ],
]);

function attachmentError(status, code) {
  return new HttpError(status, code);
}

function normalizedContentType(request) {
  const value = request.headers['content-type'];
  if (typeof value !== 'string') {
    throw attachmentError(415, 'image_type_unsupported');
  }
  const contentType = value.split(';', 1)[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw attachmentError(415, 'image_type_unsupported');
  }
  return contentType;
}

function decodedOriginalName(request) {
  const encoded = request.headers['x-image-name'];
  if (typeof encoded !== 'string' || encoded.length > 512) return 'image';
  let value;
  try {
    value = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return 'image';
  }
  const name = path.basename(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return name || 'image';
}

function declaredContentLength(request) {
  const value = request.headers['content-length'];
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
    throw attachmentError(400, 'image_length_invalid');
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw attachmentError(400, 'image_empty');
  }
  if (length > MAX_IMAGE_UPLOAD_BYTES) {
    throw attachmentError(413, 'image_too_large');
  }
  return length;
}

function writeAll(handle, chunk) {
  return (async () => {
    let offset = 0;
    while (offset < chunk.length) {
      const { bytesWritten } = await handle.write(
        chunk,
        offset,
        chunk.length - offset,
      );
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
        throw new Error('image_write_failed');
      }
      offset += bytesWritten;
    }
  })();
}

export function detectImageKind(value) {
  const bytes = Buffer.from(value || []);
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'png';
  }
  if (
    bytes.length >= 16 &&
    bytes.subarray(4, 8).toString('ascii') === 'ftyp'
  ) {
    const brands = [];
    for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
      brands.push(bytes.subarray(offset, offset + 4).toString('ascii'));
    }
    if (brands.some((brand) => brand === 'avif' || brand === 'avis')) {
      return null;
    }
    if (
      brands.some((brand) =>
        ['heic', 'heix', 'hevc', 'hevx'].includes(brand),
      )
    ) {
      return 'heic';
    }
  }
  return null;
}

export async function readImageUpload(
  request,
  {
    temporaryRoot = os.tmpdir(),
  } = {},
) {
  const contentType = normalizedContentType(request);
  const declaredLength = declaredContentLength(request);
  const temporaryDirectory = await fs.mkdtemp(
    path.join(temporaryRoot, 'conductor-pocket-image-'),
  );
  await fs.chmod(temporaryDirectory, 0o700);
  const sourcePath = path.join(temporaryDirectory, 'source');
  let handle;
  try {
    handle = await fs.open(
      sourcePath,
      filesystemConstants.O_CREAT |
        filesystemConstants.O_EXCL |
        filesystemConstants.O_WRONLY |
        filesystemConstants.O_NOFOLLOW,
      0o600,
    );
    const hash = createHash('sha256');
    const prefix = [];
    let prefixBytes = 0;
    let bytes = 0;
    for await (const value of request) {
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > MAX_IMAGE_UPLOAD_BYTES) {
        throw attachmentError(413, 'image_too_large');
      }
      if (prefixBytes < 64) {
        const part = chunk.subarray(0, 64 - prefixBytes);
        prefix.push(part);
        prefixBytes += part.length;
      }
      hash.update(chunk);
      await writeAll(handle, chunk);
    }
    await handle.sync();
    await handle.close();
    handle = null;
    if (bytes === 0) throw attachmentError(400, 'image_empty');
    if (declaredLength != null && bytes !== declaredLength) {
      throw attachmentError(400, 'image_length_invalid');
    }
    const kind = detectImageKind(Buffer.concat(prefix));
    if (!kind || !CONTENT_TYPES_BY_KIND.get(kind)?.has(contentType)) {
      throw attachmentError(415, 'image_type_unsupported');
    }
    return {
      temporaryDirectory,
      sourcePath,
      originalName: decodedOriginalName(request),
      bytes,
      digest: hash.digest('base64url'),
      kind,
      async cleanup() {
        await fs.rm(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      },
    };
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.rm(temporaryDirectory, {
      recursive: true,
      force: true,
    });
    throw error;
  }
}

function parseSipsInspection(stdout) {
  const properties = new Map();
  for (const field of String(stdout).split('|')) {
    const separator = field.indexOf(':');
    if (separator < 0) continue;
    properties.set(
      field.slice(0, separator).trim(),
      field.slice(separator + 1).trim(),
    );
  }
  const width = Number(properties.get('pixelWidth'));
  const height = Number(properties.get('pixelHeight'));
  const format = properties.get('format');
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    typeof format !== 'string'
  ) {
    throw attachmentError(422, 'image_invalid');
  }
  return {
    width,
    height,
    format: format.toLowerCase(),
  };
}

async function inspectImage(imagePath) {
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/sips',
      [
        '-1',
        '-g',
        'pixelWidth',
        '-g',
        'pixelHeight',
        '-g',
        'format',
        imagePath,
      ],
      {
        timeout: 15_000,
        maxBuffer: 256 * 1024,
      },
    );
    return parseSipsInspection(stdout);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw attachmentError(422, 'image_invalid');
  }
}

export async function normalizeImage(
  upload,
  {
    maximumDimension = MAX_IMAGE_DIMENSION,
  } = {},
) {
  const source = await inspectImage(upload.sourcePath);
  if (
    source.width > MAX_SOURCE_DIMENSION ||
    source.height > MAX_SOURCE_DIMENSION ||
    source.width * source.height > MAX_IMAGE_PIXELS
  ) {
    throw attachmentError(413, 'image_dimensions_too_large');
  }
  const pixelPath = path.join(upload.temporaryDirectory, 'pixels.bmp');
  const outputPath = path.join(upload.temporaryDirectory, 'image.jpg');
  const thumbnailPath = path.join(
    upload.temporaryDirectory,
    'thumbnail.jpg',
  );
  const pixelArguments = [];
  if (
    source.width > maximumDimension ||
    source.height > maximumDimension
  ) {
    pixelArguments.push('-Z', String(maximumDimension));
  }
  pixelArguments.push(
    '-s',
    'format',
    'bmp',
    upload.sourcePath,
    '--out',
    pixelPath,
  );
  try {
    await execFileAsync(
      '/usr/bin/sips',
      pixelArguments,
      {
        timeout: 30_000,
        maxBuffer: 512 * 1024,
      },
    );
    await execFileAsync(
      '/usr/bin/sips',
      [
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '82',
        pixelPath,
        '--out',
        outputPath,
      ],
      {
        timeout: 30_000,
        maxBuffer: 512 * 1024,
      },
    );
  } catch {
    throw attachmentError(422, 'image_invalid');
  }
  await execFileAsync('/usr/bin/xattr', ['-c', outputPath], {
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  }).catch(() => {});
  const output = await inspectImage(outputPath);
  const stat = await fs.stat(outputPath);
  const prefixHandle = await fs.open(
    outputPath,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  );
  const prefix = Buffer.alloc(16);
  try {
    await prefixHandle.read(prefix, 0, prefix.length, 0);
  } finally {
    await prefixHandle.close();
  }
  if (
    output.format !== 'jpeg' ||
    detectImageKind(prefix) !== 'jpeg' ||
    output.width > maximumDimension ||
    output.height > maximumDimension ||
    stat.size <= 0 ||
    stat.size > MAX_IMAGE_OUTPUT_BYTES
  ) {
    throw attachmentError(422, 'image_invalid');
  }
  let thumbnail = null;
  try {
    await execFileAsync(
      '/usr/bin/sips',
      [
        '-Z',
        String(THUMBNAIL_DIMENSION),
        '-s',
        'format',
        'jpeg',
        '-s',
        'formatOptions',
        '72',
        pixelPath,
        '--out',
        thumbnailPath,
      ],
      {
        timeout: 20_000,
        maxBuffer: 512 * 1024,
      },
    );
    await execFileAsync('/usr/bin/xattr', ['-c', thumbnailPath], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    }).catch(() => {});
    const thumbnailInspection = await inspectImage(thumbnailPath);
    const thumbnailStat = await fs.stat(thumbnailPath);
    const thumbnailHandle = await fs.open(
      thumbnailPath,
      filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
    );
    const thumbnailPrefix = Buffer.alloc(16);
    try {
      await thumbnailHandle.read(
        thumbnailPrefix,
        0,
        thumbnailPrefix.length,
        0,
      );
    } finally {
      await thumbnailHandle.close();
    }
    if (
      thumbnailInspection.format === 'jpeg' &&
      detectImageKind(thumbnailPrefix) === 'jpeg' &&
      thumbnailInspection.width <= THUMBNAIL_DIMENSION &&
      thumbnailInspection.height <= THUMBNAIL_DIMENSION &&
      thumbnailStat.size > 0 &&
      thumbnailStat.size <= MAX_IMAGE_OUTPUT_BYTES
    ) {
      thumbnail = {
        path: thumbnailPath,
        width: thumbnailInspection.width,
        height: thumbnailInspection.height,
        bytes: thumbnailStat.size,
      };
    }
  } catch {
    thumbnail = null;
  }
  return {
    path: outputPath,
    width: output.width,
    height: output.height,
    bytes: stat.size,
    thumbnail,
  };
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertDirectory(directoryPath, errorCode) {
  let stat;
  try {
    stat = await fs.lstat(directoryPath);
  } catch {
    throw attachmentError(503, errorCode);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw attachmentError(503, errorCode);
  }
}

async function ensurePrivateDirectory(directoryPath) {
  try {
    await fs.mkdir(directoryPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  await assertDirectory(directoryPath, 'workspace_path_unavailable');
  await fs.chmod(directoryPath, 0o700);
}

async function privateAttachmentRoot(workspacePath) {
  if (typeof workspacePath !== 'string' || !path.isAbsolute(workspacePath)) {
    throw attachmentError(503, 'workspace_path_unavailable');
  }
  let workspace;
  try {
    await assertDirectory(workspacePath, 'workspace_path_unavailable');
    workspace = await fs.realpath(workspacePath);
  } catch {
    throw attachmentError(503, 'workspace_path_unavailable');
  }
  const contextPath = path.join(workspace, '.context');
  const attachmentRoot = path.join(contextPath, 'attachments');
  try {
    await fs.mkdir(contextPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw attachmentError(503, 'workspace_path_unavailable');
    }
  }
  await assertDirectory(contextPath, 'workspace_path_unavailable');
  try {
    await ensurePrivateDirectory(attachmentRoot);
  } catch {
    throw attachmentError(503, 'workspace_path_unavailable');
  }
  const resolvedContext = await fs.realpath(contextPath);
  const resolvedRoot = await fs.realpath(attachmentRoot);
  if (
    !isWithin(workspace, resolvedContext) ||
    !isWithin(resolvedContext, resolvedRoot)
  ) {
    throw attachmentError(503, 'workspace_path_unavailable');
  }
  return {
    workspace,
    attachmentRoot: resolvedRoot,
  };
}

async function existingAttachmentRoot(workspacePath) {
  if (typeof workspacePath !== 'string' || !path.isAbsolute(workspacePath)) {
    return null;
  }
  const workspaceStat = await fs.lstat(workspacePath).catch(() => null);
  if (
    !workspaceStat?.isDirectory() ||
    workspaceStat.isSymbolicLink()
  ) {
    return null;
  }
  const workspace = await fs.realpath(workspacePath).catch(() => null);
  if (!workspace) return null;
  const contextPath = path.join(workspace, '.context');
  const attachmentRoot = path.join(contextPath, 'attachments');
  const contextStat = await fs.lstat(contextPath).catch(() => null);
  const rootStat = await fs.lstat(attachmentRoot).catch(() => null);
  if (
    !contextStat?.isDirectory() ||
    contextStat.isSymbolicLink() ||
    !rootStat?.isDirectory() ||
    rootStat.isSymbolicLink()
  ) {
    return null;
  }
  const resolvedContext = await fs.realpath(contextPath).catch(
    () => null,
  );
  const resolvedRoot = await fs.realpath(attachmentRoot).catch(
    () => null,
  );
  if (
    !resolvedContext ||
    !resolvedRoot ||
    !isWithin(workspace, resolvedContext) ||
    !isWithin(resolvedContext, resolvedRoot)
  ) {
    return null;
  }
  return {
    workspace,
    attachmentRoot: resolvedRoot,
  };
}

function digestParts(label, ...parts) {
  const hash = createHash('sha256');
  hash.update(label);
  for (const part of parts) {
    const value = Buffer.from(String(part), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    hash.update(length);
    hash.update(value);
  }
  return hash.digest('base64url');
}

function scopeDigest(salt, label, value) {
  return digestParts(`scope:${label}`, salt, value);
}

async function writeExclusive(sourcePath, destinationPath) {
  const sourceHandle = await fs.open(
    sourcePath,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  ).catch(() => null);
  if (!sourceHandle) {
    throw attachmentError(422, 'image_invalid');
  }
  let source;
  try {
    const sourceStat = await sourceHandle.stat();
    if (
      !sourceStat.isFile() ||
      sourceStat.size <= 0 ||
      sourceStat.size > MAX_IMAGE_OUTPUT_BYTES
    ) {
      throw attachmentError(422, 'image_invalid');
    }
    source = await sourceHandle.readFile();
  } finally {
    await sourceHandle.close();
  }
  const handle = await fs.open(
    destinationPath,
    filesystemConstants.O_CREAT |
      filesystemConstants.O_EXCL |
      filesystemConstants.O_WRONLY |
      filesystemConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(source);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.chmod(destinationPath, 0o600);
  return {
    bytes: source.length,
    digest: createHash('sha256').update(source).digest('base64url'),
  };
}

function publicAttachment(record) {
  return {
    id: record.id,
    name: record.name,
    bytes: record.bytes,
    width: record.width,
    height: record.height,
  };
}

function validateAttachmentIds(ids) {
  if (!Array.isArray(ids) || ids.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw attachmentError(400, 'attachment_limit_exceeded');
  }
  if (
    ids.some((id) => !validAttachmentId(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw attachmentError(400, 'attachment_invalid');
  }
  return ids;
}

function positiveInteger(value, maximum) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function validImageMetadata(
  value,
  {
    name,
    maximumDimension,
  },
) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      value.name === name &&
      positiveInteger(value.bytes, MAX_IMAGE_OUTPUT_BYTES) &&
      positiveInteger(value.width, maximumDimension) &&
      positiveInteger(value.height, maximumDimension) &&
      value.width * value.height <= MAX_IMAGE_PIXELS &&
      typeof value.digest === 'string' &&
      HASH_PATTERN.test(value.digest),
  );
}

function normalizedImageMetadata(value, maximumDimension) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.path !== 'string' ||
    !path.isAbsolute(value.path) ||
    !positiveInteger(value.bytes, MAX_IMAGE_OUTPUT_BYTES) ||
    !positiveInteger(value.width, maximumDimension) ||
    !positiveInteger(value.height, maximumDimension) ||
    value.width * value.height > MAX_IMAGE_PIXELS
  ) {
    throw attachmentError(422, 'image_invalid');
  }
  return value;
}

async function syncDirectory(directory) {
  const handle = await fs.open(
    directory,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  ).catch(() => null);
  if (!handle) return;
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function ledgerForRecord(record) {
  return {
    kind: POCKET_LEDGER_KIND,
    version: POCKET_LEDGER_VERSION,
    state: 'ready',
    salt: record.scopeSalt,
    attachmentIdHash: scopeDigest(
      record.scopeSalt,
      'attachment',
      record.id,
    ),
    scope: {
      deviceHash: record.deviceHash,
      sessionHash: record.sessionHash,
      workspaceHash: record.workspaceHash,
    },
    upload: {
      keyHash: record.uploadKeyHash,
      fingerprintHash: record.uploadFingerprintHash,
      sourceDigest: record.digest,
      expiresAt: record.uploadExpiresAt,
    },
    image: {
      name: record.name,
      bytes: record.bytes,
      width: record.width,
      height: record.height,
      digest: record.fileDigest,
    },
    thumbnail: record.thumbnail
      ? {
          name: record.thumbnail.name,
          bytes: record.thumbnail.bytes,
          width: record.thumbnail.width,
          height: record.thumbnail.height,
          digest: record.thumbnail.digest,
        }
      : null,
    retained: record.retained,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

function claimForRecord(record) {
  return {
    kind: POCKET_LEDGER_KIND,
    version: POCKET_LEDGER_VERSION,
    state: 'creating',
    salt: record.scopeSalt,
    attachmentIdHash: scopeDigest(
      record.scopeSalt,
      'attachment',
      record.id,
    ),
    scope: {
      deviceHash: record.deviceHash,
      sessionHash: record.sessionHash,
      workspaceHash: record.workspaceHash,
    },
    upload: {
      keyHash: record.uploadKeyHash,
      fingerprintHash: record.uploadFingerprintHash,
      sourceDigest: record.digest,
      expiresAt: record.uploadExpiresAt,
    },
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

async function prepareAtomicLedgerBody(directory, value) {
  const ledgerPath = path.join(directory, POCKET_LEDGER_NAME);
  const temporaryPath = path.join(
    directory,
    `${POCKET_LEDGER_NAME}.${randomBytes(12).toString('base64url')}.tmp`,
  );
  const body = Buffer.from(
    `${JSON.stringify(value)}\n`,
    'utf8',
  );
  if (body.length <= 0 || body.length > MAX_LEDGER_BYTES) {
    throw attachmentError(503, 'attachment_persistence_failed');
  }
  let handle;
  try {
    handle = await fs.open(
      temporaryPath,
      filesystemConstants.O_CREAT |
        filesystemConstants.O_EXCL |
        filesystemConstants.O_WRONLY |
        filesystemConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(body);
    await handle.sync();
    await handle.close();
    handle = null;
  } catch {
    await handle?.close().catch(() => {});
    await fs.unlink(temporaryPath).catch(() => {});
    throw attachmentError(503, 'attachment_persistence_failed');
  }
  let finished = false;
  return {
    async commit() {
      if (finished) return;
      try {
        await fs.rename(temporaryPath, ledgerPath);
        finished = true;
        await syncDirectory(directory).catch(() => {});
      } catch {
        if (finished) return;
        throw attachmentError(503, 'attachment_persistence_failed');
      }
    },
    async abort() {
      if (finished) return;
      finished = true;
      await fs.unlink(temporaryPath).catch(() => {});
    },
  };
}

async function writeAtomicLedgerBody(directory, value) {
  const prepared = await prepareAtomicLedgerBody(directory, value);
  await prepared.commit();
}

async function writeAtomicLedger(record) {
  await writeAtomicLedgerBody(record.directory, ledgerForRecord(record));
}

async function prepareAtomicLedger(record) {
  return prepareAtomicLedgerBody(
    record.directory,
    ledgerForRecord(record),
  );
}

async function writeAtomicClaim(record) {
  await writeAtomicLedgerBody(record.directory, claimForRecord(record));
}

async function readPrivateLedger(ledgerPath) {
  const handle = await fs.open(
    ledgerPath,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  ).catch(() => null);
  if (!handle) return null;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.isSymbolicLink?.() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size <= 0 ||
      stat.size > MAX_LEDGER_BYTES
    ) {
      return null;
    }
    const body = await handle.readFile();
    if (body.length !== stat.size) return null;
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  } finally {
    await handle.close();
  }
}

async function openVerifiedPocketImage(filePath, metadata) {
  const fileStat = await fs.lstat(filePath).catch(() => null);
  if (
    !fileStat?.isFile() ||
    fileStat.isSymbolicLink() ||
    fileStat.nlink !== 1 ||
    (fileStat.mode & 0o777) !== 0o600 ||
    fileStat.size !== metadata.bytes
  ) {
    return null;
  }
  const resolved = await fs.realpath(filePath).catch(() => null);
  if (!resolved || resolved !== filePath) return null;
  const handle = await fs.open(
    filePath,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  ).catch(() => null);
  if (!handle) return null;
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.dev !== fileStat.dev ||
      stat.ino !== fileStat.ino ||
      stat.size !== metadata.bytes
    ) {
      await handle.close();
      return null;
    }
    return handle;
  } catch {
    await handle.close().catch(() => {});
    return null;
  }
}

async function verifyPocketImageMetadata(filePath, metadata) {
  const handle = await openVerifiedPocketImage(filePath, metadata);
  if (!handle) return false;
  await handle.close();
  return true;
}

async function readVerifiedPocketImage(filePath, metadata) {
  const handle = await openVerifiedPocketImage(filePath, metadata);
  if (!handle) return null;
  try {
    const body = await handle.readFile();
    if (
      body.length !== metadata.bytes ||
      detectImageKind(body.subarray(0, 64)) !== 'jpeg' ||
      createHash('sha256').update(body).digest('base64url') !==
        metadata.digest
    ) {
      return null;
    }
    return body;
  } finally {
    await handle.close();
  }
}

function validLedgerShape(ledger) {
  return Boolean(
    ledger &&
      typeof ledger === 'object' &&
      ledger.kind === POCKET_LEDGER_KIND &&
      ledger.version === POCKET_LEDGER_VERSION &&
      ledger.state === 'ready' &&
      typeof ledger.salt === 'string' &&
      SALT_PATTERN.test(ledger.salt) &&
      typeof ledger.attachmentIdHash === 'string' &&
      HASH_PATTERN.test(ledger.attachmentIdHash) &&
      ledger.scope &&
      typeof ledger.scope === 'object' &&
      HASH_PATTERN.test(ledger.scope.deviceHash || '') &&
      HASH_PATTERN.test(ledger.scope.sessionHash || '') &&
      HASH_PATTERN.test(ledger.scope.workspaceHash || '') &&
      ledger.upload &&
      typeof ledger.upload === 'object' &&
      HASH_PATTERN.test(ledger.upload.keyHash || '') &&
      HASH_PATTERN.test(ledger.upload.fingerprintHash || '') &&
      SAFE_DIGEST_PATTERN.test(ledger.upload.sourceDigest || '') &&
      Number.isSafeInteger(ledger.upload.expiresAt) &&
      ledger.upload.expiresAt > 0 &&
      validImageMetadata(ledger.image, {
        name: 'image.jpg',
        maximumDimension: MAX_IMAGE_DIMENSION,
      }) &&
      (ledger.thumbnail === null ||
        validImageMetadata(ledger.thumbnail, {
          name: 'thumbnail.jpg',
          maximumDimension: THUMBNAIL_DIMENSION,
        })) &&
      typeof ledger.retained === 'boolean' &&
      Number.isSafeInteger(ledger.createdAt) &&
      ledger.createdAt > 0 &&
      Number.isSafeInteger(ledger.expiresAt) &&
      ledger.expiresAt > 0,
  );
}

function validClaimShape(ledger, storage, id) {
  return Boolean(
    ledger &&
      typeof ledger === 'object' &&
      ledger.kind === POCKET_LEDGER_KIND &&
      ledger.version === POCKET_LEDGER_VERSION &&
      ledger.state === 'creating' &&
      SALT_PATTERN.test(ledger.salt || '') &&
      HASH_PATTERN.test(ledger.attachmentIdHash || '') &&
      ledger.attachmentIdHash ===
        scopeDigest(ledger.salt, 'attachment', id) &&
      ledger.scope &&
      HASH_PATTERN.test(ledger.scope.deviceHash || '') &&
      HASH_PATTERN.test(ledger.scope.sessionHash || '') &&
      HASH_PATTERN.test(ledger.scope.workspaceHash || '') &&
      ledger.scope.workspaceHash ===
        scopeDigest(ledger.salt, 'workspace', storage.workspace) &&
      ledger.upload &&
      HASH_PATTERN.test(ledger.upload.keyHash || '') &&
      HASH_PATTERN.test(ledger.upload.fingerprintHash || '') &&
      SAFE_DIGEST_PATTERN.test(ledger.upload.sourceDigest || '') &&
      Number.isSafeInteger(ledger.upload.expiresAt) &&
      ledger.upload.expiresAt > 0 &&
      Number.isSafeInteger(ledger.createdAt) &&
      ledger.createdAt > 0 &&
      Number.isSafeInteger(ledger.expiresAt) &&
      ledger.expiresAt > 0,
  );
}

async function loadPocketClaim(storage, id) {
  if (!validAttachmentId(id)) return null;
  const directory = path.join(storage.attachmentRoot, id);
  const directoryStat = await fs.lstat(directory).catch(() => null);
  if (
    !directoryStat?.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    (directoryStat.mode & 0o777) !== 0o700 ||
    (await fs.realpath(directory).catch(() => null)) !== directory
  ) {
    return null;
  }
  const ledger = await readPrivateLedger(
    path.join(directory, POCKET_LEDGER_NAME),
  );
  if (!validClaimShape(ledger, storage, id)) return null;
  return {
    id,
    directory,
    attachmentRoot: storage.attachmentRoot,
    workspacePath: storage.workspace,
    scopeSalt: ledger.salt,
    deviceHash: ledger.scope.deviceHash,
    retained: false,
    expiresAt: ledger.expiresAt,
    directoryDevice: directoryStat.dev,
    directoryInode: directoryStat.ino,
  };
}

async function loadPocketRecord(storage, id) {
  if (!validAttachmentId(id)) return null;
  const directory = path.join(storage.attachmentRoot, id);
  const directoryStat = await fs.lstat(directory).catch(() => null);
  if (
    !directoryStat?.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    (directoryStat.mode & 0o777) !== 0o700
  ) {
    return null;
  }
  const resolvedDirectory = await fs.realpath(directory).catch(
    () => null,
  );
  if (
    !resolvedDirectory ||
    resolvedDirectory !== directory ||
    !isWithin(storage.attachmentRoot, resolvedDirectory)
  ) {
    return null;
  }
  const ledger = await readPrivateLedger(
    path.join(directory, POCKET_LEDGER_NAME),
  );
  if (
    !validLedgerShape(ledger) ||
    ledger.attachmentIdHash !==
      scopeDigest(ledger.salt, 'attachment', id) ||
    ledger.scope.workspaceHash !==
      scopeDigest(ledger.salt, 'workspace', storage.workspace)
  ) {
    return null;
  }
  if (!(await verifyPocketImageMetadata(
    path.join(directory, ledger.image.name),
    ledger.image,
  ))) {
    return null;
  }
  if (
    ledger.thumbnail &&
    !(await verifyPocketImageMetadata(
      path.join(directory, ledger.thumbnail.name),
      ledger.thumbnail,
    ))
  ) {
    return null;
  }
  return {
    id,
    name: ledger.image.name,
    relativePath: `.context/attachments/${id}/${ledger.image.name}`,
    destinationPath: path.join(directory, ledger.image.name),
    directory,
    attachmentRoot: storage.attachmentRoot,
    workspacePath: storage.workspace,
    scopeSalt: ledger.salt,
    deviceHash: ledger.scope.deviceHash,
    sessionHash: ledger.scope.sessionHash,
    workspaceHash: ledger.scope.workspaceHash,
    bytes: ledger.image.bytes,
    width: ledger.image.width,
    height: ledger.image.height,
    fileDigest: ledger.image.digest,
    thumbnail: ledger.thumbnail
      ? {
          ...ledger.thumbnail,
          path: path.join(directory, ledger.thumbnail.name),
        }
      : null,
    digest: ledger.upload.sourceDigest,
    uploadKeyHash: ledger.upload.keyHash,
    uploadFingerprintHash: ledger.upload.fingerprintHash,
    uploadExpiresAt: ledger.upload.expiresAt,
    retained: ledger.retained,
    createdAt: ledger.createdAt,
    expiresAt: ledger.expiresAt,
    directoryDevice: directoryStat.dev,
    directoryInode: directoryStat.ino,
  };
}

function recordKey(record) {
  return `${record.attachmentRoot}\u0000${record.id}`;
}

function matchesDevice(record, deviceId) {
  return (
    record.deviceHash ===
    scopeDigest(record.scopeSalt, 'device', deviceId)
  );
}

function matchesScope(
  record,
  {
    deviceId,
    sessionId,
    workspace,
  },
) {
  return Boolean(
    matchesDevice(record, deviceId) &&
      record.sessionHash ===
        scopeDigest(record.scopeSalt, 'session', sessionId) &&
      record.workspaceHash ===
        scopeDigest(record.scopeSalt, 'workspace', workspace),
  );
}

async function readNativeAttachment(
  storage,
  id,
  referencedAttachment,
) {
  if (
    !referencedAttachment ||
    referencedAttachment.id !== id ||
    typeof referencedAttachment.name !== 'string' ||
    path.basename(referencedAttachment.name) !==
      referencedAttachment.name ||
    !/^[A-Za-z0-9_.-]{1,120}$/.test(referencedAttachment.name)
  ) {
    throw attachmentError(404, 'attachment_not_found');
  }
  const extension = path.extname(referencedAttachment.name).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(extension)) {
    throw attachmentError(404, 'attachment_not_found');
  }
  const candidateDirectory = path.join(storage.attachmentRoot, id);
  const candidatePath = path.join(
    candidateDirectory,
    referencedAttachment.name,
  );
  const directoryStat = await fs.lstat(candidateDirectory).catch(
    () => null,
  );
  if (
    !directoryStat?.isDirectory() ||
    directoryStat.isSymbolicLink()
  ) {
    throw attachmentError(404, 'attachment_not_found');
  }
  const resolvedDirectory = await fs.realpath(candidateDirectory).catch(
    () => null,
  );
  const resolvedCandidate = await fs.realpath(candidatePath).catch(
    () => null,
  );
  if (
    resolvedDirectory !== candidateDirectory ||
    !resolvedCandidate ||
    !isWithin(candidateDirectory, resolvedCandidate) ||
    !isWithin(storage.attachmentRoot, resolvedCandidate)
  ) {
    throw attachmentError(404, 'attachment_not_found');
  }
  const handle = await fs.open(
    resolvedCandidate,
    filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
  ).catch(() => null);
  if (!handle) throw attachmentError(404, 'attachment_not_found');
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size <= 0 ||
      stat.size > MAX_IMAGE_UPLOAD_BYTES
    ) {
      throw attachmentError(404, 'attachment_not_found');
    }
    const body = await handle.readFile();
    const kind = detectImageKind(body.subarray(0, 64));
    const contentType =
      extension === '.png' ? 'image/png' : 'image/jpeg';
    if (
      (contentType === 'image/png' && kind !== 'png') ||
      (contentType === 'image/jpeg' && kind !== 'jpeg')
    ) {
      throw attachmentError(404, 'attachment_not_found');
    }
    return {
      body,
      contentType,
      name: referencedAttachment.name,
    };
  } finally {
    await handle.close();
  }
}

export class AttachmentManager {
  #now;
  #normalize;
  #beforeLedgerPrepare;
  #records = new Map();
  #uploads = new Map();
  #rate = new Map();
  #reservedBytes = new Map();
  #roots = new Map();
  #janitor = null;
  #janitorStopped = false;
  #prunePromise = null;
  #lifecycleLocks = new Map();
  #activeDeviceUploads = new Map();
  #revokedDevices = new Set();
  #activeNormalizations = 0;
  #normalizationWaiters = [];

  constructor({
    now = () => Date.now(),
    normalize = normalizeImage,
    beforeLedgerPrepare = async () => {},
  } = {}) {
    this.#now = now;
    this.#normalize = normalize;
    this.#beforeLedgerPrepare = beforeLedgerPrepare;
  }

  stop() {
    this.#janitorStopped = true;
    if (this.#janitor) clearInterval(this.#janitor);
    this.#janitor = null;
  }

  assertUploadAllowed(deviceId) {
    const now = this.#now();
    const cutoff = now - RATE_WINDOW_MS;
    const attempts = (this.#rate.get(deviceId) || []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (attempts.length >= RATE_LIMIT) {
      throw attachmentError(429, 'image_rate_limited');
    }
    attempts.push(now);
    this.#rate.set(deviceId, attempts);
  }

  async upload(options) {
    const finishUpload = this.#beginDeviceUpload(
      options?.deviceId,
    );
    try {
      return await this.#upload(options);
    } finally {
      finishUpload();
    }
  }

  async #upload({
    key,
    deviceId,
    sessionId,
    workspacePath,
    workspacePaths = [],
    upload,
  }) {
    if (workspacePaths.length > 0) {
      await this.ensureWorkspaces(workspacePaths);
    }
    const storage = await this.#prepareStorage(workspacePath);
    await this.#prune({ scan: false });
    const keyHash = digestParts('upload-key', key);
    const fingerprintHash = digestParts(
      'upload-fingerprint',
      deviceId,
      sessionId,
      storage.workspace,
      upload.kind,
      upload.bytes,
      upload.digest,
    );
    const existing = this.#uploads.get(keyHash);
    if (existing) {
      if (
        existing.conflict ||
        existing.fingerprintHash !== fingerprintHash
      ) {
        throw attachmentError(409, 'idempotency_key_reused');
      }
      return existing.promise;
    }
    const promise = this.#materialize({
      deviceId,
      sessionId,
      storage,
      upload,
      keyHash,
      fingerprintHash,
    });
    this.#uploads.set(keyHash, {
      fingerprintHash,
      promise,
      expiresAt: this.#now() + UPLOAD_TTL_MS,
      recordKey: null,
      conflict: false,
    });
    try {
      return await promise;
    } catch (error) {
      if (this.#uploads.get(keyHash)?.promise === promise) {
        this.#uploads.delete(keyHash);
      }
      throw error;
    }
  }

  #beginDeviceUpload(deviceId) {
    const key = digestParts('runtime-device', deviceId);
    if (this.#revokedDevices.has(key)) {
      throw attachmentError(401, 'device_revoked');
    }
    let state = this.#activeDeviceUploads.get(key);
    if (!state) {
      let resolveIdle;
      const idle = new Promise((resolve) => {
        resolveIdle = resolve;
      });
      state = {
        active: 0,
        idle,
        resolveIdle,
      };
      this.#activeDeviceUploads.set(key, state);
    }
    state.active += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      state.active -= 1;
      if (state.active > 0) return;
      this.#activeDeviceUploads.delete(key);
      state.resolveIdle();
    };
  }

  async #revokeDeviceUploads(deviceId) {
    const key = digestParts('runtime-device', deviceId);
    this.#revokedDevices.add(key);
    const state = this.#activeDeviceUploads.get(key);
    if (state) await state.idle;
  }

  async #materialize({
    deviceId,
    sessionId,
    storage,
    upload,
    keyHash,
    fingerprintHash,
  }) {
    const initialStagedBytes = [...this.#records.values()]
      .filter(
        (record) =>
          matchesDevice(record, deviceId) &&
          !record.retained,
      )
      .reduce((total, record) => total + record.bytes, 0);
    if (
      initialStagedBytes +
        (this.#reservedBytes.get(deviceId) || 0) >=
      STAGED_DEVICE_BYTES
    ) {
      throw attachmentError(429, 'image_quota_exceeded');
    }
    const normalized = normalizedImageMetadata(
      await this.#normalizeWithLimit(upload),
      MAX_IMAGE_DIMENSION,
    );
    const normalizedThumbnail = normalized.thumbnail
      ? normalizedImageMetadata(
          normalized.thumbnail,
          THUMBNAIL_DIMENSION,
        )
      : null;
    const stagedBytes = [...this.#records.values()]
      .filter(
        (record) =>
          matchesDevice(record, deviceId) &&
          !record.retained,
      )
      .reduce((total, record) => total + record.bytes, 0);
    const reservedBytes = this.#reservedBytes.get(deviceId) || 0;
    if (
      stagedBytes + reservedBytes + normalized.bytes >
      STAGED_DEVICE_BYTES
    ) {
      throw attachmentError(429, 'image_quota_exceeded');
    }
    this.#reservedBytes.set(
      deviceId,
      reservedBytes + normalized.bytes,
    );
    try {
      const { workspace, attachmentRoot } = storage;
      let id;
      let directory;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        id = randomBytes(9).toString('base64url');
        directory = path.join(attachmentRoot, id);
        try {
          await fs.mkdir(directory, {
            mode: 0o700,
          });
          break;
        } catch (error) {
          if (error?.code !== 'EEXIST' || attempt === 4) throw error;
        }
      }
      const destinationPath = path.join(directory, 'image.jpg');
      const thumbnailPath = path.join(directory, 'thumbnail.jpg');
      const now = this.#now();
      const scopeSalt = randomBytes(16).toString('base64url');
      const record = {
        id,
        name: 'image.jpg',
        relativePath: `.context/attachments/${id}/image.jpg`,
        destinationPath,
        directory,
        attachmentRoot,
        workspacePath: workspace,
        scopeSalt,
        deviceHash: scopeDigest(scopeSalt, 'device', deviceId),
        sessionHash: scopeDigest(scopeSalt, 'session', sessionId),
        workspaceHash: scopeDigest(
          scopeSalt,
          'workspace',
          workspace,
        ),
        bytes: normalized.bytes,
        width: normalized.width,
        height: normalized.height,
        fileDigest: null,
        thumbnail: null,
        digest: upload.digest,
        uploadKeyHash: keyHash,
        uploadFingerprintHash: fingerprintHash,
        uploadExpiresAt: now + UPLOAD_TTL_MS,
        retained: false,
        createdAt: now,
        expiresAt: now + UNUSED_ATTACHMENT_TTL_MS,
      };
      return await this.#withLifecycleLocks(
        [recordKey(record)],
        async () => {
          try {
            await writeAtomicClaim(record);
            const storedImage = await writeExclusive(
              normalized.path,
              destinationPath,
            );
            if (storedImage.bytes !== normalized.bytes) {
              throw attachmentError(422, 'image_invalid');
            }
            let storedThumbnail = null;
            if (normalizedThumbnail) {
              storedThumbnail = await writeExclusive(
                normalizedThumbnail.path,
                thumbnailPath,
              );
              if (
                storedThumbnail.bytes !== normalizedThumbnail.bytes
              ) {
                throw attachmentError(422, 'image_invalid');
              }
            }
            record.fileDigest = storedImage.digest;
            record.thumbnail = storedThumbnail
              ? {
                  name: 'thumbnail.jpg',
                  path: thumbnailPath,
                  bytes: normalizedThumbnail.bytes,
                  width: normalizedThumbnail.width,
                  height: normalizedThumbnail.height,
                  digest: storedThumbnail.digest,
                }
              : null;
            await writeAtomicLedger(record);
            const directoryStat = await fs.lstat(directory);
            record.directoryDevice = directoryStat.dev;
            record.directoryInode = directoryStat.ino;
            this.#registerRecord(record);
            return publicAttachment(record);
          } catch (error) {
            await fs.rm(directory, {
              recursive: true,
              force: true,
            });
            throw error;
          }
        },
      );
    } finally {
      const remaining =
        (this.#reservedBytes.get(deviceId) || 0) -
        normalized.bytes;
      if (remaining > 0) this.#reservedBytes.set(deviceId, remaining);
      else this.#reservedBytes.delete(deviceId);
    }
  }

  async #normalizeWithLimit(upload) {
    let inheritedSlot = false;
    if (
      this.#activeNormalizations >= MAX_CONCURRENT_NORMALIZATIONS
    ) {
      await new Promise((resolve) => {
        this.#normalizationWaiters.push(resolve);
      });
      inheritedSlot = true;
    }
    if (!inheritedSlot) this.#activeNormalizations += 1;
    try {
      return await this.#normalize(upload);
    } finally {
      const next = this.#normalizationWaiters.shift();
      if (next) {
        next();
      } else {
        this.#activeNormalizations -= 1;
      }
    }
  }

  async resolveForSend(
    ids,
    {
      deviceId,
      sessionId,
      workspacePath,
    },
  ) {
    validateAttachmentIds(ids);
    if (ids.length === 0) return [];
    const storage = await this.#prepareStorage(workspacePath);
    await this.#prune({ scan: false });
    const attachments = [];
    for (const id of ids) {
      const record = await this.#freshRecord(storage, id);
      if (
        !record ||
        !matchesScope(record, {
          deviceId,
          sessionId,
          workspace: storage.workspace,
        })
      ) {
        throw attachmentError(409, 'attachment_unavailable');
      }
      attachments.push({
        ...publicAttachment(record),
        relativePath: record.relativePath,
        digest: record.digest,
      });
    }
    return attachments;
  }

  async retainForSend(
    ids,
    {
      deviceId,
      sessionId,
      workspacePath,
    },
  ) {
    return this.#transitionRetention(ids, {
      deviceId,
      sessionId,
      workspacePath,
      retained: true,
    });
  }

  async releaseAfterUnsent(
    ids,
    {
      deviceId,
      sessionId,
      workspacePath,
    },
  ) {
    return this.#transitionRetention(ids, {
      deviceId,
      sessionId,
      workspacePath,
      retained: false,
    });
  }

  async remove(
    id,
    {
      deviceId,
      sessionId,
      workspacePath,
    },
  ) {
    if (!validAttachmentId(id)) {
      throw attachmentError(400, 'attachment_invalid');
    }
    const storage = await this.#prepareStorage(workspacePath);
    await this.#prune({ scan: false });
    return this.#withLifecycleLocks(
      [`${storage.attachmentRoot}\u0000${id}`],
      async () => {
        const record = await this.#freshRecord(storage, id, {
          lifecycleLocked: true,
        });
        if (
          !record ||
          !matchesScope(record, {
            deviceId,
            sessionId,
            workspace: storage.workspace,
          })
        ) {
          return false;
        }
        if (record.retained) {
          throw attachmentError(409, 'attachment_already_sent');
        }
        return this.#deleteRecord(record);
      },
    );
  }

  async read(
    id,
    {
      deviceId,
      sessionId,
      workspacePath,
      referencedAttachment,
      variant = 'full',
    },
  ) {
    if (!validAttachmentId(id)) {
      throw attachmentError(404, 'attachment_not_found');
    }
    const storage = await this.#prepareStorage(workspacePath);
    await this.#prune({ scan: false });
    const record = await this.#freshRecord(storage, id);
    if (
      record &&
      matchesScope(record, {
        deviceId,
        sessionId,
        workspace: storage.workspace,
      })
    ) {
      const selected =
        variant === 'thumbnail' && record.thumbnail
          ? record.thumbnail
          : {
              name: record.name,
              path: record.destinationPath,
              bytes: record.bytes,
              width: record.width,
              height: record.height,
              digest: record.fileDigest,
            };
      const body = await readVerifiedPocketImage(
        selected.path,
        selected,
      );
      if (!body) {
        this.#unregisterRecord(record);
        throw attachmentError(404, 'attachment_not_found');
      }
      return {
        body,
        contentType: 'image/jpeg',
        name: selected.name,
      };
    }
    return readNativeAttachment(
      storage,
      id,
      referencedAttachment,
    );
  }

  async ensureWorkspaces(workspacePaths) {
    return this.#discoverWorkspaces(workspacePaths, {
      force: false,
    });
  }

  async sweepWorkspaces(workspacePaths) {
    return this.#discoverWorkspaces(workspacePaths, {
      force: true,
    });
  }

  async #discoverWorkspaces(
    workspacePaths,
    {
      force,
    },
  ) {
    if (!Array.isArray(workspacePaths)) {
      throw attachmentError(400, 'workspace_path_unavailable');
    }
    for (const workspacePath of new Set(workspacePaths)) {
      const storage = await existingAttachmentRoot(workspacePath);
      if (!storage) continue;
      let state = this.#roots.get(storage.attachmentRoot);
      if (!state) {
        state = {
          ...storage,
          loading: null,
          loaded: false,
        };
        this.#roots.set(storage.attachmentRoot, state);
      }
      this.#startJanitor();
      if (force || !state.loaded) await this.#scanRoot(state);
    }
    await this.#prune({ scan: false });
    return this.#roots.size;
  }

  async purgeDevice(
    deviceId,
    {
      workspacePath,
      workspacePaths = [],
    } = {},
  ) {
    await this.#revokeDeviceUploads(deviceId);
    const paths = [
      ...workspacePaths,
      ...(workspacePath ? [workspacePath] : []),
    ];
    if (paths.length > 0) await this.sweepWorkspaces(paths);
    else await this.#prune();
    let removed = 0;
    for (const record of [...this.#records.values()]) {
      if (!matchesDevice(record, deviceId)) continue;
      await this.#withLifecycleLocks([recordKey(record)], async () => {
        const fresh = await loadPocketRecord(
          {
            workspace: record.workspacePath,
            attachmentRoot: record.attachmentRoot,
          },
          record.id,
        );
        if (
          fresh &&
          !fresh.retained &&
          matchesDevice(fresh, deviceId) &&
          (await this.#deleteRecord(fresh))
        ) {
          removed += 1;
        }
      });
    }
    return removed;
  }

  async #transitionRetention(
    ids,
    {
      deviceId,
      sessionId,
      workspacePath,
      retained,
    },
  ) {
    validateAttachmentIds(ids);
    if (ids.length === 0) return [];
    const storage = await this.#prepareStorage(workspacePath);
    await this.#prune({ scan: false });
    const keys = ids.map(
      (id) => `${storage.attachmentRoot}\u0000${id}`,
    );
    return this.#withLifecycleLocks(keys, async () => {
      const originals = [];
      for (const id of ids) {
        const record = await this.#freshRecord(storage, id, {
          lifecycleLocked: true,
        });
        if (
          !record ||
          !matchesScope(record, {
            deviceId,
            sessionId,
            workspace: storage.workspace,
          })
        ) {
          throw attachmentError(409, 'attachment_unavailable');
        }
        if (
          retained &&
          !(await readVerifiedPocketImage(
            record.destinationPath,
            {
              bytes: record.bytes,
              digest: record.fileDigest,
            },
          ))
        ) {
          this.#unregisterRecord(record);
          throw attachmentError(409, 'attachment_unavailable');
        }
        originals.push(record);
      }
      const updates = originals.map((original) => ({
        ...original,
        retained,
        expiresAt:
          this.#now() +
          (retained
            ? UPLOAD_TTL_MS
            : UNUSED_ATTACHMENT_TTL_MS),
      }));
      const preparedUpdates = [];
      const preparedRollbacks = [];
      const committed = [];
      try {
        for (let index = 0; index < updates.length; index += 1) {
          await this.#beforeLedgerPrepare({
            phase: 'update',
            index,
            record: updates[index],
          });
          preparedUpdates.push(
            await prepareAtomicLedger(updates[index]),
          );
          await this.#beforeLedgerPrepare({
            phase: 'rollback',
            index,
            record: originals[index],
          });
          preparedRollbacks.push(
            await prepareAtomicLedger(originals[index]),
          );
        }
        for (let index = 0; index < updates.length; index += 1) {
          await preparedUpdates[index].commit();
          const updated = updates[index];
          this.#registerRecord(updated);
          committed.push(index);
        }
        await Promise.all(
          preparedRollbacks.map((prepared) => prepared.abort()),
        );
      } catch (error) {
        let rollbackFailed = false;
        for (const index of committed.reverse()) {
          try {
            await preparedRollbacks[index].commit();
            this.#registerRecord(originals[index]);
          } catch {
            rollbackFailed = true;
          }
        }
        await Promise.all([
          ...preparedUpdates.map((prepared) => prepared.abort()),
          ...preparedRollbacks.map((prepared) => prepared.abort()),
        ]);
        if (rollbackFailed) {
          throw attachmentError(
            503,
            'attachment_persistence_failed',
          );
        }
        throw error;
      }
      return originals.map((record) => ({
        ...publicAttachment(record),
        relativePath: record.relativePath,
        digest: record.digest,
      }));
    });
  }

  async #withLifecycleLocks(keys, operation) {
    const ordered = [...new Set(keys)].sort();
    const acquire = async (index) => {
      if (index >= ordered.length) return operation();
      const key = ordered[index];
      const previous =
        this.#lifecycleLocks.get(key) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const queued = previous.catch(() => {}).then(() => gate);
      this.#lifecycleLocks.set(key, queued);
      await previous.catch(() => {});
      try {
        return await acquire(index + 1);
      } finally {
        release();
        if (this.#lifecycleLocks.get(key) === queued) {
          this.#lifecycleLocks.delete(key);
        }
      }
    };
    return acquire(0);
  }

  #startJanitor() {
    if (
      this.#janitor ||
      this.#janitorStopped ||
      this.#roots.size === 0
    ) {
      return;
    }
    this.#janitor = setInterval(() => {
      void this.#prune().catch(() => {});
    }, JANITOR_INTERVAL_MS);
    this.#janitor.unref?.();
  }

  async #prepareStorage(workspacePath) {
    const storage = await privateAttachmentRoot(workspacePath);
    let state = this.#roots.get(storage.attachmentRoot);
    if (!state) {
      state = {
        ...storage,
        loading: null,
        loaded: false,
      };
      this.#roots.set(storage.attachmentRoot, state);
    }
    this.#startJanitor();
    if (!state.loaded) {
      await this.#scanRoot(state);
    }
    return storage;
  }

  async #scanRoot(state) {
    if (state.loading) return state.loading;
    state.loading = (async () => {
      const entries = await fs.readdir(state.attachmentRoot, {
        withFileTypes: true,
      }).catch(() => []);
      const seen = new Set();
      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          entry.isSymbolicLink() ||
          !validAttachmentId(entry.name)
        ) {
          continue;
        }
        const key = `${state.attachmentRoot}\u0000${entry.name}`;
        const found = await this.#withLifecycleLocks(
          [key],
          async () => {
            const record = await loadPocketRecord(
              state,
              entry.name,
            );
            if (record) {
              this.#registerRecord(record);
              return true;
            }
            const existing = this.#records.get(key);
            if (existing) this.#unregisterRecord(existing);
            const claim = await loadPocketClaim(state, entry.name);
            if (claim && claim.expiresAt <= this.#now()) {
              await this.#deleteClaim(claim);
            }
            return false;
          },
        );
        if (found) seen.add(key);
      }
      for (const record of [...this.#records.values()]) {
        if (
          record.attachmentRoot === state.attachmentRoot &&
          !seen.has(recordKey(record))
        ) {
          const key = recordKey(record);
          await this.#withLifecycleLocks([key], async () => {
            const fresh = await loadPocketRecord(
              state,
              record.id,
            );
            if (fresh) {
              this.#registerRecord(fresh);
              seen.add(key);
              return;
            }
            const existing = this.#records.get(key);
            if (existing) this.#unregisterRecord(existing);
          });
        }
      }
      state.loaded = true;
    })();
    try {
      await state.loading;
    } finally {
      state.loading = null;
    }
  }

  #registerRecord(record) {
    const key = recordKey(record);
    this.#records.set(key, record);
    const now = this.#now();
    if (record.uploadExpiresAt <= now) return;
    const existing = this.#uploads.get(record.uploadKeyHash);
    const promise = Promise.resolve(publicAttachment(record));
    if (
      !existing ||
      existing.expiresAt <= now ||
      existing.recordKey === key
    ) {
      this.#uploads.set(record.uploadKeyHash, {
        fingerprintHash: record.uploadFingerprintHash,
        promise,
        expiresAt: record.uploadExpiresAt,
        recordKey: key,
        conflict: false,
      });
      return;
    }
    if (
      existing.recordKey === null &&
      existing.fingerprintHash === record.uploadFingerprintHash
    ) {
      this.#uploads.set(record.uploadKeyHash, {
        ...existing,
        expiresAt: record.uploadExpiresAt,
        recordKey: key,
        conflict: false,
      });
      return;
    }
    if (
      existing.fingerprintHash !== record.uploadFingerprintHash ||
      existing.recordKey !== key
    ) {
      this.#uploads.set(record.uploadKeyHash, {
        fingerprintHash: existing.fingerprintHash,
        promise: existing.promise,
        expiresAt: Math.max(
          existing.expiresAt,
          record.uploadExpiresAt,
        ),
        recordKey: existing.recordKey,
        conflict: true,
      });
    }
  }

  #unregisterRecord(record) {
    const key = recordKey(record);
    if (this.#records.get(key)?.id === record.id) {
      this.#records.delete(key);
    }
    const upload = this.#uploads.get(record.uploadKeyHash);
    if (upload?.recordKey === key) {
      this.#uploads.delete(record.uploadKeyHash);
    }
  }

  async #freshRecord(
    storage,
    id,
    {
      lifecycleLocked = false,
    } = {},
  ) {
    const key = `${storage.attachmentRoot}\u0000${id}`;
    const load = async () => {
      const record = await loadPocketRecord(storage, id);
      if (!record) {
        const existing = this.#records.get(key);
        if (existing) this.#unregisterRecord(existing);
        return null;
      }
      this.#registerRecord(record);
      return record;
    };
    if (lifecycleLocked) return load();
    return this.#withLifecycleLocks([key], load);
  }

  async #deleteRecord(record) {
    const storage = {
      workspace: record.workspacePath,
      attachmentRoot: record.attachmentRoot,
    };
    const verified = await loadPocketRecord(storage, record.id);
    if (!verified) {
      this.#unregisterRecord(record);
      return false;
    }
    if (verified.retained) {
      this.#registerRecord(verified);
      return false;
    }
    const directoryStat = await fs.lstat(verified.directory).catch(
      () => null,
    );
    if (
      !directoryStat?.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      directoryStat.dev !== verified.directoryDevice ||
      directoryStat.ino !== verified.directoryInode
    ) {
      this.#unregisterRecord(record);
      return false;
    }
    const entries = await fs.readdir(verified.directory, {
      withFileTypes: true,
    }).catch(() => null);
    if (!entries) return false;
    const expected = new Set([
      POCKET_LEDGER_NAME,
      verified.name,
      ...(verified.thumbnail ? [verified.thumbnail.name] : []),
    ]);
    for (const entry of entries) {
      if (expected.has(entry.name)) {
        if (!entry.isFile() || entry.isSymbolicLink()) return false;
        continue;
      }
      if (
        !LEDGER_TEMP_PATTERN.test(entry.name) ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        return false;
      }
    }
    await fs.rm(verified.directory, {
      recursive: true,
      force: false,
    }).catch(() => null);
    const stillExists = await fs.lstat(verified.directory).catch(
      () => null,
    );
    if (stillExists) return false;
    this.#unregisterRecord(verified);
    return true;
  }

  async #deleteClaim(claim) {
    const storage = {
      workspace: claim.workspacePath,
      attachmentRoot: claim.attachmentRoot,
    };
    const verified = await loadPocketClaim(storage, claim.id);
    if (!verified || verified.expiresAt > this.#now()) return false;
    const entries = await fs.readdir(verified.directory, {
      withFileTypes: true,
    }).catch(() => null);
    if (!entries) return false;
    for (const entry of entries) {
      const allowed =
        entry.name === POCKET_LEDGER_NAME ||
        entry.name === 'image.jpg' ||
        entry.name === 'thumbnail.jpg' ||
        LEDGER_TEMP_PATTERN.test(entry.name);
      if (
        !allowed ||
        !entry.isFile() ||
        entry.isSymbolicLink()
      ) {
        return false;
      }
    }
    await fs.rm(verified.directory, {
      recursive: true,
      force: false,
    }).catch(() => null);
    return !(await fs.lstat(verified.directory).catch(() => null));
  }

  async #prune({ scan = true } = {}) {
    if (this.#prunePromise) return this.#prunePromise;
    this.#prunePromise = (async () => {
      if (scan) {
        for (const state of this.#roots.values()) {
          await this.#scanRoot(state);
        }
      }
      const now = this.#now();
      for (const [key, upload] of this.#uploads) {
        if (upload.expiresAt <= now) this.#uploads.delete(key);
      }
      for (const record of [...this.#records.values()]) {
        if (record.retained || record.expiresAt > now) continue;
        await this.#withLifecycleLocks(
          [recordKey(record)],
          async () => {
            const fresh = await loadPocketRecord(
              {
                workspace: record.workspacePath,
                attachmentRoot: record.attachmentRoot,
              },
              record.id,
            );
            if (
              fresh &&
              !fresh.retained &&
              fresh.expiresAt <= now
            ) {
              await this.#deleteRecord(fresh);
            }
          },
        );
      }
    })();
    try {
      await this.#prunePromise;
    } finally {
      this.#prunePromise = null;
    }
  }
}
