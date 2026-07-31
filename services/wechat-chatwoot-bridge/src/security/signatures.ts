const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null;
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    result[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return result;
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function timestampWithinWindow(
  timestampSeconds: string,
  nowMs: number,
  toleranceMs = 5 * 60 * 1000,
): boolean {
  if (!/^\d{1,16}$/.test(timestampSeconds)) return false;
  const timestampMs = Number(timestampSeconds) * 1000;
  return (
    Number.isSafeInteger(timestampMs) &&
    Math.abs(nowMs - timestampMs) <= toleranceMs
  );
}

export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyTencentCallbackSignature(input: {
  encryptedPayload: string;
  nonce: string;
  signature: string;
  timestamp: string;
  token: string;
}): Promise<boolean> {
  // Tencent documents the signed timestamp as signature input but does not
  // publish a five-minute expiry. Delayed authenticated wake-ups are accepted;
  // the durable callback receipt key must suppress replays.
  const joined = [
    input.token,
    input.timestamp,
    input.nonce,
    input.encryptedPayload,
  ]
    .sort()
    .join("");
  const expected = hexToBytes(await sha1Hex(joined));
  const actual = hexToBytes(input.signature);
  return expected !== null && actual !== null && constantTimeEqual(expected, actual);
}

export async function chatwootSignature(rawBody: string, timestamp: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  return `sha256=${bytesToHex(new Uint8Array(signature))}`;
}

async function verifyChatwootSignature(input: {
  rawBody: string;
  secret: string;
  signature: string;
  timestamp: string;
}): Promise<boolean> {
  const expected = encoder.encode(
    await chatwootSignature(input.rawBody, input.timestamp, input.secret),
  );
  const actual = encoder.encode(input.signature.toLowerCase());
  return constantTimeEqual(expected, actual);
}

export async function verifyChatwootWebhook(input: {
  nowMs: number;
  rawBody: string;
  secret: string;
  signature: string;
  timestamp: string;
}): Promise<boolean> {
  if (!timestampWithinWindow(input.timestamp, input.nowMs)) return false;
  return verifyChatwootSignature(input);
}
