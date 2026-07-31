export interface ChatwootMessageCreated {
  account?: { id?: number };
  attachments?: unknown[];
  content?: string;
  content_type?: string;
  conversation?: {
    additional_attributes?: Record<string, unknown>;
    inbox_id?: number;
  };
  event?: string;
  id?: number;
  message_type?: string;
  private?: boolean;
  sender?: { id?: number; type?: string };
}

export type FilterResult =
  | {
      accepted: true;
      messageId: number;
      approverId: number;
      content: string;
    }
  | {
      accepted: false;
      reason:
        | "wrong-event"
        | "wrong-account"
        | "wrong-inbox"
        | "not-public-outgoing"
        | "not-human-agent"
        | "bridge-echo"
        | "missing-id"
        | "unsupported-content";
    };

export function filterChatwootOutbound(
  payload: ChatwootMessageCreated,
  expectedAccountId: number,
  expectedInboxId: number,
): FilterResult {
  if (payload.event !== "message_created") {
    return { accepted: false, reason: "wrong-event" };
  }
  if (payload.account?.id !== expectedAccountId) {
    return { accepted: false, reason: "wrong-account" };
  }
  if (payload.conversation?.inbox_id !== expectedInboxId) {
    return { accepted: false, reason: "wrong-inbox" };
  }
  if (payload.message_type !== "outgoing" || payload.private !== false) {
    return { accepted: false, reason: "not-public-outgoing" };
  }
  if (payload.sender?.type !== "user" || payload.sender.id === undefined) {
    return { accepted: false, reason: "not-human-agent" };
  }
  if (payload.conversation.additional_attributes?.wechat_bridge_origin === true) {
    return { accepted: false, reason: "bridge-echo" };
  }
  if (payload.id === undefined) {
    return { accepted: false, reason: "missing-id" };
  }
  const content = payload.content ?? "";
  const contentBytes = new TextEncoder().encode(content).byteLength;
  if (
    payload.content_type !== "text" ||
    (payload.attachments?.length ?? 0) !== 0 ||
    content.trim().length === 0 ||
    contentBytes > 2_048
  ) {
    return { accepted: false, reason: "unsupported-content" };
  }
  return {
    accepted: true,
    messageId: payload.id,
    approverId: payload.sender.id,
    content,
  };
}
