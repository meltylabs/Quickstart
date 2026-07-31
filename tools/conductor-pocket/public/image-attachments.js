export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_DIRECT_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_LOCAL_IMAGE_BYTES = MAX_DIRECT_UPLOAD_BYTES;
export const CLIENT_IMAGE_DIMENSION = 2560;
export const MAX_ATTACHMENT_MESSAGE_BYTES = 16 * 1024;
const DIRECT_FAST_PATH_BYTES = 1_500_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
]);
const IMAGE_TYPE_BY_EXTENSION = new Map([
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
]);
const RETRYABLE_IMAGE_ERRORS = new Set([
  'image_prepare_failed',
  'image_quota_exceeded',
  'image_rate_limited',
  'image_upload_failed',
  'image_upload_timeout',
  'internal_error',
]);

export function imageMediaType(file) {
  if (!file || typeof file !== 'object') return null;
  const declared = String(file.type || '').toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(declared)) return declared;
  if (declared && declared !== 'application/octet-stream') return null;
  const extension = String(file.name || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1];
  return IMAGE_TYPE_BY_EXTENSION.get(extension) || null;
}

export function imageSelectionError(file) {
  if (!file || typeof file !== 'object') return 'image_invalid';
  if (!imageMediaType(file)) return 'image_type_unsupported';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'image_empty';
  if (file.size > MAX_LOCAL_IMAGE_BYTES) return 'image_too_large';
  return null;
}

export function fittedImageSize(width, height, maximum = CLIENT_IMAGE_DIMENSION) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(maximum) ||
    maximum <= 0
  ) {
    throw new TypeError('image_dimensions_invalid');
  }
  const scale = Math.min(1, maximum / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('image_encode_failed')),
      type,
      quality,
    );
  });
}

function loadHtmlImage(file, documentRef, urlApi) {
  return new Promise((resolve, reject) => {
    const image = documentRef.createElement('img');
    const url = urlApi.createObjectURL(file);
    image.onload = () => {
      urlApi.revokeObjectURL(url);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close() {},
      });
    };
    image.onerror = () => {
      urlApi.revokeObjectURL(url);
      reject(new Error('image_decode_failed'));
    };
    image.src = url;
  });
}

async function decodeImage(
  file,
  {
    createImageBitmapImpl = globalThis.createImageBitmap,
    documentRef = globalThis.document,
    urlApi = globalThis.URL,
  } = {},
) {
  if (typeof createImageBitmapImpl === 'function') {
    const bitmap = await createImageBitmapImpl(file, {
      imageOrientation: 'from-image',
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close?.(),
    };
  }
  if (!documentRef || !urlApi) throw new Error('image_decode_unavailable');
  return loadHtmlImage(file, documentRef, urlApi);
}

export async function prepareImageForUpload(
  file,
  {
    documentRef = globalThis.document,
    createImageBitmapImpl = globalThis.createImageBitmap,
    urlApi = globalThis.URL,
  } = {},
) {
  const selectionError = imageSelectionError(file);
  if (selectionError) {
    const error = new Error(selectionError);
    error.code = selectionError;
    throw error;
  }
  if (file.size <= DIRECT_FAST_PATH_BYTES) {
    return {
      blob: file,
      resized: false,
    };
  }
  let decoded;
  try {
    decoded = await decodeImage(file, {
      createImageBitmapImpl,
      documentRef,
      urlApi,
    });
    const size = fittedImageSize(decoded.width, decoded.height);
    const canvas = documentRef.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    try {
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      if (!context) throw new Error('image_canvas_unavailable');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(decoded.source, 0, 0, size.width, size.height);
      const blob = await canvasBlob(canvas, 'image/jpeg', 0.82);
      if (
        blob.size > 0 &&
        blob.size <= MAX_DIRECT_UPLOAD_BYTES &&
        blob.size < file.size
      ) {
        return {
          blob,
          resized: true,
        };
      }
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  } catch (error) {
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      error.code ||= 'image_prepare_failed';
      throw error;
    }
  } finally {
    decoded?.close();
  }
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    const error = new Error('image_too_large');
    error.code = 'image_too_large';
    throw error;
  }
  return {
    blob: file,
    resized: false,
  };
}

export function imageErrorCopy(code) {
  const copy = new Map([
    ['attachment_limit_exceeded', 'You can send up to 4 photos at once.'],
    ['attachment_unavailable', 'That photo expired. Choose it again.'],
    ['idempotency_key_reused', 'Upload changed. Tap to retry.'],
    [
      'image_dimensions_too_large',
      'That photo’s dimensions are too large. Choose another one.',
    ],
    ['image_decode_failed', 'That photo could not be opened.'],
    ['image_encode_failed', 'That photo could not be prepared.'],
    ['image_canvas_unavailable', 'That photo could not be prepared.'],
    ['image_empty', 'That photo is empty. Choose another one.'],
    ['image_invalid', 'That photo could not be opened.'],
    ['image_prepare_failed', 'That photo could not be prepared.'],
    ['image_quota_exceeded', 'Remove an unsent photo before adding another.'],
    ['image_rate_limited', 'Too many photos at once. Wait a moment and retry.'],
    ['image_upload_timeout', 'Upload stalled. Tap to retry.'],
    ['image_upload_failed', 'Upload failed. Tap to retry.'],
    ['image_too_large', 'That photo is over 20 MB. Choose a smaller photo.'],
    [
      'image_type_unsupported',
      'Choose a JPEG, PNG, HEIC, or HEIF photo.',
    ],
  ]);
  return copy.get(code) || 'Photo upload failed. Tap to retry.';
}

export function imageErrorIsRetryable(code) {
  return RETRYABLE_IMAGE_ERRORS.has(code);
}

export function attachmentMessageByteLength(text, attachments = []) {
  const markers = attachments.map(
    ({ id }) =>
      `@⟦image.jpg⟧(.context%2Fattachments%2F${id}%2Fimage.jpg)`,
  );
  const message = [...markers, String(text || '')]
    .filter(Boolean)
    .join(' ');
  return new TextEncoder().encode(message).byteLength;
}
