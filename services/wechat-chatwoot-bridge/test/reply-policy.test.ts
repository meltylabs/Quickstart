import { describe, expect, it } from "vitest";
import { decideReply, type ReplyRequest } from "../src/domain/reply-policy";

const base: ReplyRequest = {
  automated: false,
  approverId: 12,
  approvedAgentIds: new Set([12]),
  content: "Approved response",
  fixedAutoReplyText: "We received your message.",
  outboundEnabled: true,
  mode: "approved-only",
  now: 2_000,
  snapshot: {
    state: "OPEN_WINDOW",
    serviceState: 1,
    lastCustomerMessageSentAt: 1_000,
    outboundCount: 0,
  },
  triggerInboundMsgId: null,
};

describe("reply policy", () => {
  it("allows a human-approved response from an allowlisted agent", () => {
    expect(decideReply(base)).toEqual({
      allowed: true,
      remainingAfterSend: 4,
    });
  });

  it("fails closed when outbound is not explicitly enabled", () => {
    expect(decideReply({ ...base, outboundEnabled: false })).toEqual({
      allowed: false,
      reason: "outbound-disabled",
    });
  });

  it("only auto-sends the exact fixed acknowledgement", () => {
    const request = {
      ...base,
      automated: true,
      approverId: null,
      mode: "auto-safe" as const,
      content: "We received your message.",
      triggerInboundMsgId: "wx-inbound-1",
    };
    expect(decideReply(request).allowed).toBe(true);
    expect(
      decideReply({ ...request, content: "A model-generated answer" }),
    ).toEqual({
      allowed: false,
      reason: "auto-content-not-allowlisted",
    });
  });

  it("never sends before the customer has messaged", () => {
    expect(
      decideReply({
        ...base,
        snapshot: {
          state: "WELCOME_SENT",
          serviceState: 1,
          lastCustomerMessageSentAt: null,
          outboundCount: 0,
        },
      }),
    ).toEqual({ allowed: false, reason: "no-customer-message" });
  });

  it("never auto-sends without a fresh inbound trigger", () => {
    expect(
      decideReply({
        ...base,
        automated: true,
        approverId: null,
        mode: "auto-safe",
        content: "We received your message.",
      }),
    ).toEqual({ allowed: false, reason: "auto-trigger-required" });
  });

  it.each([2, 3, 4, null] as const)(
    "rejects Tencent service state %s",
    (serviceState) => {
      expect(
        decideReply({
          ...base,
          snapshot: { ...base.snapshot, serviceState },
        }),
      ).toEqual({
        allowed: false,
        reason: serviceState === 4 ? "closed" : "provider-state-not-sendable",
      });
    },
  );
});
