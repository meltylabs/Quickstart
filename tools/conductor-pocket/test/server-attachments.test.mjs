import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createConfig } from '../src/config.mjs';
import { HttpError } from '../src/errors.mjs';
import { createPocketServer } from '../src/server.mjs';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const ATTACHMENT_ID = 'image_upload_123';
const IDEMPOTENCY_KEY = 'attachment-test-key-123456';

function createWatcher() {
  return {
    subscribe() {
      return () => {};
    },
    stop() {},
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(
  port,
  pathname,
  {
    method = 'GET',
    body,
    headers = {},
  } = {},
) {
  return new Promise((resolve, reject) => {
    const value = body == null ? null : Buffer.from(body);
    const outgoing = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: {
          Host: '127.0.0.1:4317',
          ...(value ? { 'Content-Length': value.length } : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const rawBody = Buffer.concat(chunks);
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: rawBody.toString('utf8'),
            rawBody,
          });
        });
      },
    );
    outgoing.on('error', reject);
    outgoing.end(value || undefined);
  });
}

function mutationHeaders(extra = {}) {
  return {
    Origin: 'http://127.0.0.1:4317',
    'X-CSRF-Token': 'test-csrf',
    'Idempotency-Key': IDEMPOTENCY_KEY,
    ...extra,
  };
}

async function workspace(context) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'pocket-server-attachments-'),
  );
  context.after(() =>
    fs.rm(directory, { recursive: true, force: true }),
  );
  return directory;
}

test('secure upload, preview, removal, and native attachment send stay device/session bound', async (context) => {
  const workspacePath = await workspace(context);
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const calls = [];
  let deliveredMessage = null;
  let transportCalls = 0;
  const attachmentManager = {
    assertUploadAllowed(deviceId) {
      calls.push(['rate', deviceId]);
    },
    async upload(options) {
      calls.push([
        'upload',
        options.key,
        options.deviceId,
        options.sessionId,
        options.workspacePath,
        options.upload.kind,
      ]);
      assert.deepEqual(
        await fs.readFile(options.upload.sourcePath),
        ONE_PIXEL_PNG,
      );
      return {
        id: ATTACHMENT_ID,
        name: 'image.jpg',
        bytes: 1234,
        width: 800,
        height: 600,
      };
    },
    async resolveForSend(ids, scope) {
      calls.push(['resolve', ids, scope]);
      if (ids.length === 0) return [];
      assert.deepEqual(ids, [ATTACHMENT_ID]);
      return [
        {
          id: ATTACHMENT_ID,
          name: 'image.jpg',
          relativePath:
            `.context/attachments/${ATTACHMENT_ID}/image.jpg`,
          digest: 'private-server-digest',
          bytes: 1234,
          width: 800,
          height: 600,
        },
      ];
    },
    async retainForSend(ids, scope) {
      calls.push(['retain', ids, scope]);
    },
    async releaseAfterUnsent(ids, scope) {
      calls.push(['release', ids, scope]);
    },
    async read(id, options) {
      calls.push(['read', id, options]);
      return {
        body: ONE_PIXEL_PNG,
        contentType: 'image/png',
        name: 'image.png',
      };
    },
    async remove(id, scope) {
      calls.push(['remove', id, scope]);
      return true;
    },
  };
  const route = {
    id: 'session-a',
    workspaceName: 'Pocket',
    workspacePath,
    sandboxProvider: null,
    title: 'Images',
    titleOrdinal: 1,
  };
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {
        calls.push(['origin']);
      },
      session(_request, options) {
        calls.push(['session', options]);
        return {
          device: { id: 'device-a' },
          unlocked: true,
          csrfToken: 'test-csrf',
        };
      },
    },
    database: {
      getSessionRoute(id) {
        return id === route.id ? route : null;
      },
      resolveSessionAttachment(sessionId, id) {
        assert.equal(sessionId, route.id);
        return id === ATTACHMENT_ID
          ? { id, name: 'image.jpg' }
          : null;
      },
      getSessionMessageCursor() {
        return 0;
      },
      listUserMessagesAfter() {
        if (!deliveredMessage) return [];
        return [
          {
            id: 'message-1',
            rowId: 1,
            text: deliveredMessage,
            createdAt: new Date().toISOString(),
            sentAt: new Date().toISOString(),
          },
        ];
      },
    },
    watcher: createWatcher(),
    attachmentManager,
    transport: {
      async send(options) {
        transportCalls += 1;
        deliveredMessage = options.message;
        return {
          ok: true,
          code: 'sent',
          composerOwned: true,
          pressedAt: Date.now(),
        };
      },
      async doctor() {
        return { ok: true };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const uploaded = await request(
    port,
    '/api/sessions/session-a/attachments',
    {
      method: 'POST',
      body: ONE_PIXEL_PNG,
      headers: mutationHeaders({
        'Content-Type': 'image/png',
        'X-Image-Name': Buffer.from('iphone photo.png').toString(
          'base64url',
        ),
      }),
    },
  );
  assert.equal(uploaded.status, 201);
  assert.deepEqual(JSON.parse(uploaded.body), {
    attachment: {
      id: ATTACHMENT_ID,
      name: 'image.jpg',
      bytes: 1234,
      width: 800,
      height: 600,
    },
  });
  assert.equal(uploaded.body.includes('digest'), false);
  assert.ok(
    calls.some(
      (entry) =>
        entry[0] === 'upload' &&
        entry[1] === `device-a:${IDEMPOTENCY_KEY}` &&
        entry[2] === 'device-a' &&
        entry[3] === 'session-a' &&
        entry[4] === workspacePath &&
        entry[5] === 'png',
    ),
  );

  const preview = await request(
    port,
    `/api/sessions/session-a/attachments/${ATTACHMENT_ID}`,
  );
  assert.equal(preview.status, 200);
  assert.equal(preview.headers['content-type'], 'image/png');
  assert.equal(preview.headers['cache-control'], 'no-store, max-age=0');
  assert.match(
    preview.headers['content-security-policy'],
    /img-src 'self' blob: data:/,
  );
  assert.deepEqual(preview.rawBody, ONE_PIXEL_PNG);
  const readCall = calls.find((entry) => entry[0] === 'read');
  assert.equal(readCall[1], ATTACHMENT_ID);
  assert.equal(readCall[2].deviceId, 'device-a');
  assert.equal(readCall[2].sessionId, 'session-a');
  assert.equal(readCall[2].workspacePath, workspacePath);
  assert.equal(readCall[2].variant, 'full');

  const thumbnail = await request(
    port,
    `/api/sessions/session-a/attachments/${ATTACHMENT_ID}?variant=thumbnail`,
  );
  assert.equal(thumbnail.status, 200);
  assert.equal(
    calls.filter((entry) => entry[0] === 'read').at(-1)[2].variant,
    'thumbnail',
  );

  const invalidVariant = await request(
    port,
    `/api/sessions/session-a/attachments/${ATTACHMENT_ID}?variant=raw`,
  );
  assert.equal(invalidVariant.status, 400);
  assert.equal(
    JSON.parse(invalidVariant.body).error.code,
    'attachment_variant_invalid',
  );

  const caption = 'What is shown here?';
  const send = await request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message: caption,
        attachments: [ATTACHMENT_ID],
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'message-test-key-123456',
      }),
    },
  );
  assert.equal(send.status, 200);
  assert.equal(transportCalls, 1);
  assert.equal(
    deliveredMessage,
    `@⟦image.jpg⟧(.context%2Fattachments%2F${ATTACHMENT_ID}%2Fimage.jpg) ${caption}`,
  );
  assert.ok(
    calls.some(
      (entry) =>
        entry[0] === 'retain' &&
        entry[1][0] === ATTACHMENT_ID &&
        entry[2].deviceId === 'device-a' &&
        entry[2].sessionId === 'session-a',
      ),
  );
  assert.equal(calls.some((entry) => entry[0] === 'release'), false);

  const forgedMarker = await request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message:
          '@⟦image.jpg⟧(.context%2Fattachments%2Fforged_id%2Fimage.jpg)',
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'forged-marker-key-123456',
      }),
    },
  );
  assert.equal(forgedMarker.status, 400);
  assert.equal(
    JSON.parse(forgedMarker.body).error.code,
    'message_invalid',
  );
  assert.equal(
    JSON.parse(forgedMarker.body).error.definitelyUnsent,
    true,
  );
  assert.equal(transportCalls, 1);

  const removed = await request(
    port,
    `/api/sessions/session-a/attachments/${ATTACHMENT_ID}`,
    {
      method: 'DELETE',
      headers: mutationHeaders(),
    },
  );
  assert.equal(removed.status, 204);
  assert.ok(
    calls.some(
      (entry) =>
        entry[0] === 'remove' &&
        entry[2].deviceId === 'device-a' &&
        entry[2].sessionId === 'session-a',
    ),
  );
});

test('provably unsent attachment delivery restores the photo to a deletable staged state', async (context) => {
  const workspacePath = await workspace(context);
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  const calls = [];
  const scope = {
    deviceId: 'device-a',
    sessionId: 'session-a',
    workspacePath,
  };
  const selected = {
    id: ATTACHMENT_ID,
    name: 'image.jpg',
    relativePath:
      `.context/attachments/${ATTACHMENT_ID}/image.jpg`,
    digest: 'private-server-digest',
    bytes: 1234,
    width: 800,
    height: 600,
  };
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: scope.deviceId },
          unlocked: true,
          csrfToken: 'test-csrf',
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: scope.sessionId,
          workspaceName: 'Pocket',
          workspacePath,
          sandboxProvider: null,
          title: 'Images',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return 0;
      },
    },
    watcher: createWatcher(),
    attachmentManager: {
      async resolveForSend() {
        return [selected];
      },
      async retainForSend(ids, value) {
        calls.push(['retain', ids, value]);
      },
      async releaseAfterUnsent(ids, value) {
        calls.push(['release', ids, value]);
      },
    },
    transport: {
      async send() {
        return {
          ok: false,
          code: 'draft_conflict',
          safeToRetry: true,
          draftBase64: Buffer.from('Mac draft').toString('base64'),
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'Caption',
        attachments: [ATTACHMENT_ID],
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'safe-failure-key-123456',
      }),
    },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: 'draft_conflict', draft: 'Mac draft' },
  });
  assert.deepEqual(
    calls.map(([operation]) => operation),
    ['retain', 'release'],
  );
  assert.deepEqual(calls[1][1], [ATTACHMENT_ID]);
  assert.deepEqual(calls[1][2], scope);
});

test('a cursor read failure happens before an attachment becomes retained', async (context) => {
  const workspacePath = await workspace(context);
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let retained = 0;
  let transportCalls = 0;
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'device-a' },
          unlocked: true,
          csrfToken: 'test-csrf',
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'session-a',
          workspaceName: 'Pocket',
          workspacePath,
          sandboxProvider: null,
          title: 'Images',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        throw new Error('database_busy');
      },
    },
    watcher: createWatcher(),
    attachmentManager: {
      async resolveForSend() {
        return [
          {
            id: ATTACHMENT_ID,
            name: 'image.jpg',
            relativePath:
              `.context/attachments/${ATTACHMENT_ID}/image.jpg`,
            digest: 'private-server-digest',
            bytes: 1234,
            width: 800,
            height: 600,
          },
        ];
      },
      async retainForSend() {
        retained += 1;
      },
    },
    transport: {
      async send() {
        transportCalls += 1;
        return { ok: false, code: 'send_not_confirmed' };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const response = await request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'Caption',
        attachments: [ATTACHMENT_ID],
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'cursor-failure-key-123456',
      }),
    },
  );
  assert.equal(response.status, 500);
  assert.equal(
    JSON.parse(response.body).error.definitelyUnsent,
    true,
  );
  assert.equal(retained, 0);
  assert.equal(transportCalls, 0);
});

test('safe-failure release finishes inside the send queue before another send can retain the same photo', async (context) => {
  const workspacePath = await workspace(context);
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let retained = false;
  let transportCalls = 0;
  const acceptedRows = [];
  let releaseStartedResolve;
  let releaseFinishResolve;
  let secondTransportResolve;
  const releaseStarted = new Promise((resolve) => {
    releaseStartedResolve = resolve;
  });
  const releaseFinish = new Promise((resolve) => {
    releaseFinishResolve = resolve;
  });
  const secondTransport = new Promise((resolve) => {
    secondTransportResolve = resolve;
  });
  const selected = {
    id: ATTACHMENT_ID,
    name: 'image.jpg',
    relativePath:
      `.context/attachments/${ATTACHMENT_ID}/image.jpg`,
    digest: 'private-server-digest',
    bytes: 1234,
    width: 800,
    height: 600,
  };
  const server = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return {
          device: { id: 'device-a' },
          unlocked: true,
          csrfToken: 'test-csrf',
        };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'session-a',
          workspaceName: 'Pocket',
          workspacePath,
          sandboxProvider: null,
          title: 'Images',
          titleOrdinal: 1,
        };
      },
      getSessionMessageCursor() {
        return acceptedRows.at(-1)?.rowId || 0;
      },
      listUserMessagesAfter(_sessionId, afterRowId) {
        return acceptedRows.filter((row) => row.rowId > afterRowId);
      },
    },
    watcher: createWatcher(),
    attachmentManager: {
      async resolveForSend() {
        return [selected];
      },
      async retainForSend() {
        retained = true;
      },
      async releaseAfterUnsent() {
        releaseStartedResolve();
        await releaseFinish;
        retained = false;
      },
    },
    transport: {
      async send({ message }) {
        transportCalls += 1;
        assert.equal(retained, true);
        if (transportCalls === 1) {
          return {
            ok: false,
            code: 'draft_conflict',
            safeToRetry: true,
            draftBase64: Buffer.from('Mac draft').toString('base64'),
          };
        }
        secondTransportResolve();
        const pressedAt = Date.now();
        acceptedRows.push({
          id: 'message-2',
          rowId: 1,
          text: message,
          createdAt: new Date(pressedAt).toISOString(),
          sentAt: new Date(pressedAt).toISOString(),
        });
        return {
          ok: true,
          code: 'sent',
          composerOwned: true,
          pressedAt,
        };
      },
    },
  });
  const port = await listen(server);
  context.after(() => close(server));

  const first = request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'First caption',
        attachments: [ATTACHMENT_ID],
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'release-race-first-123456',
      }),
    },
  );
  await releaseStarted;
  const second = request(
    port,
    '/api/sessions/session-a/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'Second caption',
        attachments: [ATTACHMENT_ID],
      }),
      headers: mutationHeaders({
        'Content-Type': 'application/json',
        'Idempotency-Key': 'release-race-second-123456',
      }),
    },
  );
  const raced = await Promise.race([
    secondTransport.then(() => 'started'),
    new Promise((resolve) =>
      setTimeout(() => resolve('still-queued'), 100),
    ),
  ]);
  assert.equal(raced, 'still-queued');
  releaseFinishResolve();

  const [firstResponse, secondResponse] = await Promise.all([
    first,
    second,
  ]);
  assert.equal(firstResponse.status, 409);
  assert.equal(secondResponse.status, 200);
  assert.equal(transportCalls, 2);
  assert.equal(retained, true);
});

test('upload authentication and local-workspace checks happen before request bytes', async (context) => {
  const workspacePath = await workspace(context);
  const { config } = createConfig({
    publicOrigin: 'http://127.0.0.1:4317',
    developmentMode: true,
  });
  let managerTouched = false;
  const attachmentManager = {
    assertUploadAllowed() {
      managerTouched = true;
    },
  };
  const locked = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        throw new HttpError(401, 'authentication_required');
      },
    },
    database: {
      getSessionRoute() {
        throw new Error('database_must_not_be_touched');
      },
    },
    watcher: createWatcher(),
    transport: {},
    attachmentManager,
  });
  const lockedPort = await listen(locked);
  context.after(() => close(locked));
  const denied = await request(
    lockedPort,
    '/api/sessions/session-a/attachments',
    {
      method: 'POST',
      body: ONE_PIXEL_PNG,
      headers: mutationHeaders({ 'Content-Type': 'image/png' }),
    },
  );
  assert.equal(denied.status, 401);
  assert.equal(managerTouched, false);

  const remoteSandbox = createPocketServer({
    configStore: { value: config },
    security: {
      assertOrigin() {},
      session() {
        return { device: { id: 'device-a' } };
      },
    },
    database: {
      getSessionRoute() {
        return {
          id: 'session-a',
          workspacePath,
          sandboxProvider: 'remote-container',
        };
      },
    },
    watcher: createWatcher(),
    transport: {},
    attachmentManager,
  });
  const remotePort = await listen(remoteSandbox);
  context.after(() => close(remoteSandbox));
  const remoteDenied = await request(
    remotePort,
    '/api/sessions/session-a/attachments',
    {
      method: 'POST',
      body: ONE_PIXEL_PNG,
      headers: mutationHeaders({ 'Content-Type': 'image/png' }),
    },
  );
  assert.equal(remoteDenied.status, 409);
  assert.deepEqual(JSON.parse(remoteDenied.body), {
    error: { code: 'workspace_sandbox_unsupported' },
  });
  assert.equal(managerTouched, false);
});
