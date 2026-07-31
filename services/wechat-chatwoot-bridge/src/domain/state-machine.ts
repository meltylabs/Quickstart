export const MAX_PROVIDER_OUTBOUND = 5;
export const MAX_AUTOMATED_OUTBOUND = 4;
export const REPLY_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ConversationState =
  | "PRECREATED"
  | "ENTERED_UNMESSAGED"
  | "WELCOME_SENT"
  | "WELCOME_EXPIRED"
  | "OPEN_WINDOW"
  | "EXHAUSTED"
  | "EXPIRED"
  | "CLOSED";

export interface ConversationSnapshot {
  state: ConversationState;
  serviceState: 0 | 1 | 2 | 3 | 4 | null;
  lastCustomerMessageSentAt: number | null;
  outboundCount: number;
}

export function onEnterSession(snapshot: ConversationSnapshot): ConversationSnapshot {
  if (
    snapshot.state === "CLOSED" ||
    snapshot.lastCustomerMessageSentAt !== null
  ) {
    return snapshot;
  }
  return {
    state: "ENTERED_UNMESSAGED",
    serviceState: snapshot.serviceState,
    lastCustomerMessageSentAt: snapshot.lastCustomerMessageSentAt,
    outboundCount: snapshot.outboundCount,
  };
}

export function onWelcomeResult(
  snapshot: ConversationSnapshot,
  sent: boolean,
): ConversationSnapshot {
  if (snapshot.state !== "ENTERED_UNMESSAGED") return snapshot;
  return {
    ...snapshot,
    state: sent ? "WELCOME_SENT" : "WELCOME_EXPIRED",
  };
}

export function onCustomerMessage(
  snapshot: ConversationSnapshot,
  providerSentAt: number,
): ConversationSnapshot {
  return {
    state: "OPEN_WINDOW",
    // Customer inbound does not imply Tencent state 0. Preserve the ordered
    // authenticated state, or fail closed after an ended session until a
    // provider state event/query confirms 0 or 1.
    serviceState: snapshot.serviceState === 4 ? null : snapshot.serviceState,
    lastCustomerMessageSentAt: providerSentAt,
    outboundCount: 0,
  };
}

export function onServiceStateChange(
  snapshot: ConversationSnapshot,
  serviceState: 0 | 1 | 2 | 3 | 4,
): ConversationSnapshot {
  if (serviceState === 4) {
    return { ...snapshot, serviceState, state: "CLOSED" };
  }
  if (snapshot.state !== "CLOSED") {
    return { ...snapshot, serviceState };
  }
  return {
    ...snapshot,
    serviceState,
    state:
      snapshot.lastCustomerMessageSentAt === null
        ? "ENTERED_UNMESSAGED"
        : "OPEN_WINDOW",
  };
}

export function onOutboundAccepted(
  snapshot: ConversationSnapshot,
  automated: boolean,
): ConversationSnapshot {
  if (snapshot.state !== "OPEN_WINDOW" && snapshot.state !== "EXHAUSTED") {
    return snapshot;
  }
  const nextCount = snapshot.outboundCount + 1;
  const limit = automated ? MAX_AUTOMATED_OUTBOUND : MAX_PROVIDER_OUTBOUND;
  return {
    ...snapshot,
    outboundCount: nextCount,
    state: nextCount >= limit ? "EXHAUSTED" : snapshot.state,
  };
}

export function refreshExpiry(
  snapshot: ConversationSnapshot,
  now: number,
): ConversationSnapshot {
  if (
    snapshot.state === "CLOSED" ||
    snapshot.lastCustomerMessageSentAt === null ||
    now - snapshot.lastCustomerMessageSentAt < REPLY_WINDOW_MS
  ) {
    return snapshot;
  }
  return { ...snapshot, state: "EXPIRED" };
}

export function closeConversation(snapshot: ConversationSnapshot): ConversationSnapshot {
  return { ...snapshot, serviceState: 4, state: "CLOSED" };
}
