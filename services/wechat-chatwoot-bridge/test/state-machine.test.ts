import { describe, expect, it } from "vitest";
import {
  MAX_AUTOMATED_OUTBOUND,
  REPLY_WINDOW_MS,
  onCustomerMessage,
  onEnterSession,
  onOutboundAccepted,
  onServiceStateChange,
  onWelcomeResult,
  refreshExpiry,
  type ConversationSnapshot,
} from "../src/domain/state-machine";

const initial: ConversationSnapshot = {
  state: "PRECREATED",
  serviceState: null,
  lastCustomerMessageSentAt: null,
  outboundCount: 0,
};

describe("official Tencent conversation state", () => {
  it("moves from entry through welcome and open reply window", () => {
    const entered = onEnterSession(initial);
    expect(entered.state).toBe("ENTERED_UNMESSAGED");
    expect(onWelcomeResult(entered, true).state).toBe("WELCOME_SENT");

    const open = onCustomerMessage({ ...entered, serviceState: 1 }, 1_000);
    expect(open).toEqual({
      state: "OPEN_WINDOW",
      serviceState: 1,
      lastCustomerMessageSentAt: 1_000,
      outboundCount: 0,
    });
  });

  it("reserves the fifth provider slot from automation", () => {
    let snapshot = onCustomerMessage({ ...initial, serviceState: 1 }, 1_000);
    for (let count = 0; count < MAX_AUTOMATED_OUTBOUND; count += 1) {
      snapshot = onOutboundAccepted(snapshot, true);
    }
    expect(snapshot.state).toBe("EXHAUSTED");
    expect(snapshot.outboundCount).toBe(4);
  });

  it("expires exactly at the 48 hour boundary", () => {
    const open = onCustomerMessage({ ...initial, serviceState: 1 }, 1_000);
    expect(refreshExpiry(open, 1_000 + REPLY_WINDOW_MS - 1).state).toBe(
      "OPEN_WINDOW",
    );
    expect(refreshExpiry(open, 1_000 + REPLY_WINDOW_MS).state).toBe("EXPIRED");
  });

  it("does not let a repeated entry event demote an active conversation", () => {
    const open = onCustomerMessage({ ...initial, serviceState: 1 }, 1_000);
    expect(onEnterSession(open)).toEqual(open);
    expect(onWelcomeResult(open, true)).toEqual(open);
  });

  it("opens a fresh window when a closed customer sends again", () => {
    expect(
      onCustomerMessage(
        {
          state: "CLOSED",
          serviceState: 4,
          lastCustomerMessageSentAt: 1_000,
          outboundCount: 5,
        },
        2_000,
      ),
    ).toEqual({
      state: "OPEN_WINDOW",
      serviceState: null,
      lastCustomerMessageSentAt: 2_000,
      outboundCount: 0,
    });
  });

  it("reopens a provider-ended conversation on an authenticated state change", () => {
    const closed: ConversationSnapshot = {
      state: "CLOSED",
      serviceState: 4,
      lastCustomerMessageSentAt: 1_000,
      outboundCount: 2,
    };
    expect(onServiceStateChange(closed, 1)).toEqual({
      state: "OPEN_WINDOW",
      serviceState: 1,
      lastCustomerMessageSentAt: 1_000,
      outboundCount: 2,
    });
  });
});
