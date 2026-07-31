import { cbc } from "@noble/ciphers/aes.js";
import { constantTimeEqual } from "./signatures";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const BLOCK_SIZE = 32;

export interface TencentPlaintext {
  message: string;
  receiverId: string;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function removePkcs7(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0) throw new Error("invalid-padding");
  const padding = bytes[bytes.length - 1];
  if (padding < 1 || padding > BLOCK_SIZE || padding > bytes.length) {
    throw new Error("invalid-padding");
  }
  const actual = bytes.slice(bytes.length - padding);
  const expected = new Uint8Array(padding).fill(padding);
  if (!constantTimeEqual(actual, expected)) throw new Error("invalid-padding");
  return bytes.slice(0, bytes.length - padding);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    false,
  );
}

export function decryptTencentPayload(
  encryptedBase64: string,
  encodingAesKey: string,
  expectedReceiverId: string,
): TencentPlaintext {
  const keyBytes = decodeBase64(`${encodingAesKey}=`);
  if (keyBytes.length !== 32) throw new Error("invalid-aes-key");

  const encrypted = decodeBase64(encryptedBase64);
  if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new Error("invalid-ciphertext");
  }

  // Tencent uses PKCS#7 with a 32-byte padding block, while WebCrypto's
  // built-in AES-CBC unpadding is fixed to AES's 16-byte block. Decrypt with
  // padding disabled and validate Tencent's padding ourselves.
  const plaintext = cbc(keyBytes, keyBytes.slice(0, 16), {
    disablePadding: true,
  }).decrypt(encrypted);
  const unpadded = removePkcs7(plaintext);
  if (unpadded.length < 20) throw new Error("invalid-plaintext");

  const messageLength = readUint32BigEndian(unpadded, 16);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;
  if (messageEnd > unpadded.length) throw new Error("invalid-message-length");

  const message = decoder.decode(unpadded.slice(messageStart, messageEnd));
  const receiverId = decoder.decode(unpadded.slice(messageEnd));
  const actualReceiver = encoder.encode(receiverId);
  const expectedReceiver = encoder.encode(expectedReceiverId);
  if (!constantTimeEqual(actualReceiver, expectedReceiver)) {
    throw new Error("receiver-id-mismatch");
  }

  return { message, receiverId };
}
