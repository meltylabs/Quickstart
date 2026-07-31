import {
  MAX_AUTOMATED_OUTBOUND,
  MAX_PROVIDER_OUTBOUND,
  REPLY_WINDOW_MS,
  type ConversationSnapshot,
} from "./state-machine";

export type ReplyMode = "draft" | "approved-only" | "auto-safe";

export interface ReplyRequest {
  automated: boolean;
  approverId: number | null;
  approvedAgentIds: ReadonlySet<number>;
  content: string;
  fixedAutoReplyText: string | null;
  outboundEnabled: boolean;
  mode: ReplyMode;
  now: number;
  snapshot: ConversationSnapshot;
  triggerInboundMsgId: string | null;
}

export type ReplyDecision =
  | { allowed: true; remainingAfterSend: number }
  | {
      allowed: false;
      reason:
        | "outbound-disabled"
        | "draft-mode"
        | "closed"
        | "provider-state-not-sendable"
        | "no-customer-message"
        | "reply-window-expired"
        | "quota-exhausted"
        | "approval-required"
        | "approver-not-allowed"
        | "auto-trigger-required"
        | "auto-content-not-allowlisted";
    };

export function decideReply(request: ReplyRequest): ReplyDecision {
  if (!request.outboundEnabled) {
    return { allowed: false, reason: "outbound-disabled" };
  }
  if (request.mode === "draft") return { allowed: false, reason: "draft-mode" };
  if (
    request.snapshot.state === "CLOSED" ||
    request.snapshot.serviceState === 4
  ) {
    return { allowed: false, reason: "closed" };
  }
  if (
    request.snapshot.serviceState !== 0 &&
    request.snapshot.serviceState !== 1
  ) {
    return { allowed: false, reason: "provider-state-not-sendable" };
  }
  if (request.snapshot.lastCustomerMessageSentAt === null) {
    return { allowed: false, reason: "no-customer-message" };
  }
  if (
    request.now - request.snapshot.lastCustomerMessageSentAt >=
    REPLY_WINDOW_MS
  ) {
    return { allowed: false, reason: "reply-window-expired" };
  }

  const limit = request.automated
    ? MAX_AUTOMATED_OUTBOUND
    : MAX_PROVIDER_OUTBOUND;
  if (request.snapshot.outboundCount >= limit) {
    return { allowed: false, reason: "quota-exhausted" };
  }

  if (request.automated) {
    if (request.triggerInboundMsgId === null) {
      return { allowed: false, reason: "auto-trigger-required" };
    }
    if (
      request.mode !== "auto-safe" ||
      request.fixedAutoReplyText === null ||
      request.content !== request.fixedAutoReplyText
    ) {
      return { allowed: false, reason: "auto-content-not-allowlisted" };
    }
  } else {
    if (request.approverId === null) {
      return { allowed: false, reason: "approval-required" };
    }
    if (!request.approvedAgentIds.has(request.approverId)) {
      return { allowed: false, reason: "approver-not-allowed" };
    }
  }

  return {
    allowed: true,
    remainingAfterSend: limit - request.snapshot.outboundCount - 1,
  };
}
