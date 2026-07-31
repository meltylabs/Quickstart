import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentMessageByteLength,
  CLIENT_IMAGE_DIMENSION,
  fittedImageSize,
  imageErrorCopy,
  imageMediaType,
  imageSelectionError,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_MESSAGE_BYTES,
  MAX_DIRECT_UPLOAD_BYTES,
  prepareImageForUpload,
  imageErrorIsRetryable,
} from '../public/image-attachments.js';
import { composeAttachmentMessage } from '../src/attachment-markup.mjs';

function imageFile({
  name = 'photo.jpg',
  type = 'image/jpeg',
  size = 1000,
} = {}) {
  return { name, type, size };
}

test('image selection accepts only supported, bounded image files', () => {
  assert.equal(MAX_ATTACHMENTS_PER_MESSAGE, 4);
  assert.equal(imageMediaType(imageFile()), 'image/jpeg');
  assert.equal(
    imageMediaType(imageFile({ name: 'IMG_001.HEIC', type: '' })),
    'image/heic',
  );
  assert.equal(
    imageSelectionError(imageFile({ name: 'animation.gif', type: 'image/gif' })),
    'image_type_unsupported',
  );
  assert.equal(
    imageSelectionError(imageFile({ size: MAX_DIRECT_UPLOAD_BYTES + 1 })),
    'image_too_large',
  );
  assert.equal(imageSelectionError(imageFile({ size: 0 })), 'image_empty');
});

test('fitted dimensions preserve aspect ratio without upscaling', () => {
  assert.deepEqual(fittedImageSize(4032, 3024), {
    width: CLIENT_IMAGE_DIMENSION,
    height: 1920,
  });
  assert.deepEqual(fittedImageSize(800, 600), {
    width: 800,
    height: 600,
  });
  assert.throws(() => fittedImageSize(0, 600), /image_dimensions_invalid/);
});

test('small images take the zero-copy upload path', async () => {
  const file = imageFile({ size: 1_000_000 });
  const prepared = await prepareImageForUpload(file);
  assert.equal(prepared.blob, file);
  assert.equal(prepared.resized, false);
});

test('large images are resized before upload and release decoded memory', async () => {
  const file = imageFile({ size: 2_000_000 });
  let closed = false;
  let renderedSize = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        fillStyle: '',
        fillRect(_x, _y, width, height) {
          renderedSize = { width, height };
        },
        drawImage() {},
      };
    },
    toBlob(callback, type) {
      callback(new Blob(['resized'], { type }));
    },
  };
  const prepared = await prepareImageForUpload(file, {
    documentRef: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        return canvas;
      },
    },
    createImageBitmapImpl: async () => ({
      width: 4000,
      height: 2000,
      close() {
        closed = true;
      },
    }),
  });

  assert.deepEqual(renderedSize, {
    width: CLIENT_IMAGE_DIMENSION,
    height: 1280,
  });
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
  assert.equal(prepared.blob.type, 'image/jpeg');
  assert.equal(prepared.resized, true);
  assert.equal(closed, true);
});

test('photo errors stay short and actionable on a phone', () => {
  assert.match(imageErrorCopy('attachment_limit_exceeded'), /up to 4/);
  assert.match(imageErrorCopy('image_type_unsupported'), /JPEG/);
  assert.match(imageErrorCopy('unknown_error'), /retry/i);
  assert.equal(imageErrorIsRetryable('image_upload_timeout'), true);
  assert.equal(imageErrorIsRetryable('image_type_unsupported'), false);
});

test('caption limits include the exact native attachment marker bytes', () => {
  const attachments = [
    { id: 'image_upload_123', relativePath: 'ignored' },
  ];
  const message = composeAttachmentMessage('Hello 👋', [
    {
      id: 'image_upload_123',
      name: 'image.jpg',
      relativePath:
        '.context/attachments/image_upload_123/image.jpg',
    },
  ]);
  assert.equal(
    attachmentMessageByteLength('Hello 👋', attachments),
    Buffer.byteLength(message, 'utf8'),
  );
  assert.equal(MAX_ATTACHMENT_MESSAGE_BYTES, 16 * 1024);
});
