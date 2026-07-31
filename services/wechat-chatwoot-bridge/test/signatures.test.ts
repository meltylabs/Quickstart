import { describe, expect, it } from "vitest";
import {
  chatwootSignature,
  timestampWithinWindow,
  verifyChatwootWebhook,
  verifyTencentCallbackSignature,
} from "../src/security/signatures";

describe("webhook authentication", () => {
  it("verifies Tencent's sorted SHA-1 signature", async () => {
    const input = {
      encryptedPayload: "encrypted-payload",
      nonce: "nonce",
      timestamp: "1720000000",
      token: "callback-token",
    };
    const signature = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(
        [
          input.token,
          input.timestamp,
          input.nonce,
          input.encryptedPayload,
        ]
          .sort()
          .join(""),
      ),
    );
    const hex = Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(
      await verifyTencentCallbackSignature({ ...input, signature: hex }),
    ).toBe(true);
    expect(
      await verifyTencentCallbackSignature({
        ...input,
        signature: `0${hex.slice(1)}`,
      }),
    ).toBe(false);
  });

  it("verifies Chatwoot over exact raw bytes", async () => {
    const rawBody = '{ "content": "你好" }\n';
    const timestamp = "1720000000";
    const secret = "webhook-secret";
    const signature = await chatwootSignature(rawBody, timestamp, secret);
    expect(
      await verifyChatwootWebhook({
        nowMs: 1_720_000_000_000,
        rawBody,
        timestamp,
        secret,
        signature,
      }),
    ).toBe(true);
    expect(
      await verifyChatwootWebhook({
        nowMs: 1_720_000_000_000,
        rawBody: JSON.stringify(JSON.parse(rawBody)),
        timestamp,
        secret,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects a correctly signed but stale Chatwoot webhook", async () => {
    const rawBody = '{"event":"message_created"}';
    const timestamp = "1720000000";
    const secret = "webhook-secret";
    expect(
      await verifyChatwootWebhook({
        nowMs: 1_720_000_301_000,
        rawBody,
        timestamp,
        secret,
        signature: await chatwootSignature(rawBody, timestamp, secret),
      }),
    ).toBe(false);
  });

  it("rejects stale and malformed timestamps", () => {
    const now = 1_720_000_000_000;
    expect(timestampWithinWindow("1720000000", now)).toBe(true);
    expect(timestampWithinWindow("1719999699", now)).toBe(false);
    expect(timestampWithinWindow("not-a-time", now)).toBe(false);
  });
});
