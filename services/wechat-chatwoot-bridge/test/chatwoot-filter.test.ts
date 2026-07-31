import { describe, expect, it } from "vitest";
import { filterChatwootOutbound } from "../src/domain/chatwoot-filter";

const valid = {
  account: { id: 1 },
  attachments: [],
  content: "Approved response",
  content_type: "text",
  conversation: { inbox_id: 9, additional_attributes: {} },
  event: "message_created",
  id: 412,
  message_type: "outgoing",
  private: false,
  sender: { id: 12, type: "user" },
};

describe("Chatwoot outbound filtering", () => {
  it("accepts only a public human outgoing message in the dedicated inbox", () => {
    expect(filterChatwootOutbound(valid, 1, 9)).toEqual({
      accepted: true,
      messageId: 412,
      approverId: 12,
      content: "Approved response",
    });
  });

  it.each([
    [{ ...valid, private: true }, "not-public-outgoing"],
    [{ ...valid, message_type: "incoming" }, "not-public-outgoing"],
    [{ ...valid, account: { id: 2 } }, "wrong-account"],
    [{ ...valid, conversation: { inbox_id: 10 } }, "wrong-inbox"],
    [{ ...valid, sender: { id: 12, type: "contact" } }, "not-human-agent"],
    [{ ...valid, content_type: "input_select" }, "unsupported-content"],
    [{ ...valid, attachments: [{ id: 1 }] }, "unsupported-content"],
    [{ ...valid, content: " " }, "unsupported-content"],
    [
      {
        ...valid,
        conversation: {
          inbox_id: 9,
          additional_attributes: { wechat_bridge_origin: true },
        },
      },
      "bridge-echo",
    ],
  ])("rejects unsafe payloads", (payload, reason) => {
    expect(filterChatwootOutbound(payload, 1, 9)).toEqual({
      accepted: false,
      reason,
    });
  });

  it("enforces Tencent's 2,048-byte text limit", () => {
    expect(
      filterChatwootOutbound({ ...valid, content: "界".repeat(683) }, 1, 9),
    ).toEqual({
      accepted: false,
      reason: "unsupported-content",
    });
  });
});
