import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function applicationSource() {
  return fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
}

function functionSource(source, name, nextName) {
  const start = source.indexOf(`${name}(`);
  const end = source.indexOf(`${nextName}(`, start + name.length);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test('photo selection stages previews and starts uploads immediately', async () => {
  const source = await applicationSource();
  const selection = functionSource(
    source,
    'function addSelectedImages',
    'function composerAttachmentStatus',
  );
  const composer = functionSource(
    source,
    'function createComposer',
    'function updateRoutePanels',
  );

  assert.match(composer, /type: 'file'[\s\S]*accept: 'image\/\*'/);
  assert.match(composer, /multiple: true/);
  assert.doesNotMatch(composer, /capture:/);
  assert.match(selection, /URL\.createObjectURL\(file\)/);
  assert.match(selection, /attachmentDeliveryInFlight/);
  assert.match(
    selection,
    /Wait for the current photo message to finish first/,
  );
  assert.match(
    selection,
    /state\.attachmentsBySession\.set[\s\S]*startAttachmentUpload/,
  );
});

test('historic Conductor attachment ids remain previewable', async () => {
  const source = await applicationSource();
  const validation = functionSource(
    source,
    'function safeAttachmentId',
    'function normalizeAttachmentMetadata',
  );

  assert.match(validation, /value\.length >= 6/);
  assert.match(validation, /value\.length <= 64/);
});

test('upload retries reuse exact prepared bytes and cannot enqueue twice', async () => {
  const source = await applicationSource();
  const prepare = functionSource(
    source,
    'function prepareAttachmentItem',
    'async function uploadAttachmentItem',
  );
  const start = functionSource(
    source,
    'function startAttachmentUpload',
    'function retryAttachmentUpload',
  );
  const retry = functionSource(
    source,
    'function retryAttachmentUpload',
    'async function deleteUploadedAttachment',
  );

  assert.match(prepare, /if \(item\.preparedBlob\)/);
  assert.match(prepare, /item\.preparedBlob = prepared\.blob/);
  assert.match(source, /let imagePreparationQueue = Promise\.resolve\(\)/);
  assert.match(start, /item\.uploadInFlight/);
  assert.match(start, /item\.state = 'queued'/);
  assert.match(retry, /startAttachmentUpload\(sessionId, item\)/);
  assert.match(
    retry,
    /item\.errorCode === 'attachment_unavailable'[\s\S]*item\.uploadKey = randomIdempotencyKey\(\)/,
  );
  assert.match(source, /IMAGE_UPLOAD_TIMEOUT_MS/);
  assert.match(source, /prepared\.blob/);
});

test('one-tap send waits for photos without silently changing the send', async () => {
  const source = await applicationSource();
  const send = functionSource(
    source,
    'async function sendCurrentMessage',
    'async function deliverOptimistic',
  );
  const remove = functionSource(
    source,
    'function removeAttachment',
    'function addSelectedImages',
  );

  assert.match(send, /const queuedText = text/);
  assert.match(send, /const queuedAttachmentKeys = attachments\.map/);
  assert.match(send, /await Promise\.allSettled/);
  assert.match(
    send,
    /if \(!state\.attachmentSendIntents\.has\(sessionId\)\)[\s\S]*return/,
  );
  assert.match(send, /text = queuedText/);
  assert.match(remove, /state\.attachmentSendIntents\.delete\(sessionId\)/);
});

test('image-only messages persist tokens and send ordered attachment ids', async () => {
  const source = await applicationSource();
  const send = functionSource(
    source,
    'async function sendCurrentMessage',
    'async function deliverOptimistic',
  );
  const delivery = functionSource(
    source,
    'async function deliverOptimistic',
    'function applyDeliveryReceipt',
  );

  assert.match(
    send,
    /\(!text\.trim\(\) && attachments\.length === 0\)/,
  );
  assert.match(send, /attachments: readyAttachments/);
  assert.match(
    send,
    /attachmentMessageByteLength\(text, readyAttachments\)/,
  );
  assert.match(
    delivery,
    /attachments: \(optimistic\.attachments \|\| \[\]\)\.map/,
  );
  assert.match(delivery, /\(attachment\) => attachment\.id/);
});

test('definite preflight failures restore the caption and photo tray instead of vanishing', async () => {
  const source = await applicationSource();
  const restore = functionSource(
    source,
    'async function restoreDefinitelyUnsentDraft',
    'async function deliverOptimistic',
  );
  const delivery = functionSource(
    source,
    'async function deliverOptimistic',
    'function applyDeliveryReceipt',
  );

  assert.match(restore, /state\.attachmentsBySession\.set/);
  assert.match(restore, /saveDraft\(sessionId, combinedDraft\)/);
  assert.match(
    restore,
    /state\.optimistic = state\.optimistic\.filter/,
  );
  assert.doesNotMatch(restore, /\.slice\(0, MAX_ATTACHMENTS_PER_MESSAGE\)/);
  assert.match(
    delivery,
    /error\.definitelyUnsent[\s\S]*restoreDefinitelyUnsentDraft/,
  );
});
