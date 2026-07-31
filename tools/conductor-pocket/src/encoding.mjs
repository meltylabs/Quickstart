import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
export function sha256(value) {
  return createHash('sha256').update(value).digest('base64url');
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function fromBase64Url(value) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n');
}
