import { cbc } from "@noble/ciphers/aes.js";
import { describe, expect, it } from "vitest";
import { decryptTencentPayload } from "../src/security/tencent-crypto";

const encoder = new TextEncoder();

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encryptFixture(
  message: string,
  receiverId: string,
  keyBytes: Uint8Array,
): string {
  const messageBytes = encoder.encode(message);
  const receiverBytes = encoder.encode(receiverId);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, messageBytes.length, false);
  const body = concat(
    new Uint8Array(16).fill(7),
    length,
    messageBytes,
    receiverBytes,
  );
  const paddingLength = 32 - (body.length % 32 || 32) || 32;
  const padded = concat(
    body,
    new Uint8Array(paddingLength).fill(paddingLength),
  );
  const encrypted = cbc(keyBytes, keyBytes.slice(0, 16), {
    disablePadding: true,
  }).encrypt(padded);
  return encodeBase64(encrypted);
}

describe("Tencent callback decryption", () => {
  it("decrypts Tencent's 32-byte PKCS#7 format and validates receiver ID", () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const encodingAesKey = encodeBase64(key).replace(/=$/, "");
    const encrypted = encryptFixture(
      "<xml><Event>kf_msg_or_event</Event></xml>",
      "corp-id",
      key,
    );

    expect(
      decryptTencentPayload(encrypted, encodingAesKey, "corp-id"),
    ).toEqual({
      message: "<xml><Event>kf_msg_or_event</Event></xml>",
      receiverId: "corp-id",
    });
  });

  it("rejects a callback encrypted for another receiver", () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const encodingAesKey = encodeBase64(key).replace(/=$/, "");
    const encrypted = encryptFixture("<xml />", "other-corp", key);

    expect(() =>
      decryptTencentPayload(encrypted, encodingAesKey, "corp-id"),
    ).toThrow("receiver-id-mismatch");
  });
});
