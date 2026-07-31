# WeChat Customer Service ↔ Chatwoot Architecture

## Decision

The only supported path for ongoing automated replies is an official **WeChat
Customer Service (微信客服 / KF)** conversation.

Accepting a supplier as a friend in personal WeChat is safe as a manual action,
but it does not expose that thread to an official API. Adding the supplier as a
WeCom Customer Contact enables an official one-time welcome and human-confirmed
outreach tasks; it still does not enable ongoing direct API replies.

The operational handoff is therefore:

```text
Alex accepts supplier on the phone
          │
          └─ one manual message with supplier-specific KF link
                            │
                            ▼
Supplier enters official WeChat Customer Service thread
                            │
                            ▼
Tencent encrypted callback → sync_msg → bridge/D1 → Chatwoot API Inbox
                            ▲                              │
                            └──────── send_msg ◀──────────┘
```

## Contact onboarding

1. Pre-create the supplier in Chatwoot with an internal `supplier_id`.
2. Generate a cryptographically random scene token. Store only its SHA-256 hash
   against `supplier_id`; never put supplier PII in a URL.
3. Call `POST /cgi-bin/kf/add_contact_way` for the designated `open_kfid`.
4. Append the URL-encoded opaque token as `scene_param` to the exact returned
   URL. Do not copy Tencent parameters into a different URL.
5. Alex sends that link manually from the accepted personal-WeChat friendship,
   or it is delivered through email/Alibaba.
6. `enter_session` binds `(open_kfid, external_userid)` to the server-side
   supplier record and stable Chatwoot source ID:
   `wxkf:<open_kfid>:<external_userid>`.
7. If Tencent supplies `welcome_code`, one pre-approved text/menu welcome can be
   sent through `send_msg_on_event` within 20 seconds. This is an entry response,
   not a cold message.

## Message ingestion

Tencent's callback is a wake-up signal, not the message body:

1. Verify the SHA-1 signature over the sorted callback token, timestamp, nonce,
   and encrypted payload.
2. Treat the signed timestamp as authenticated input, but do not discard an
   otherwise valid delayed Tencent retry using an arbitrary freshness cutoff.
3. AES-decrypt and validate PKCS#7 padding, message length, and receiver/CorpID.
4. Durably claim the callback once, acknowledge quickly, and serialize work per
   `open_kfid`.
5. Start the first `sync_msg` pull immediately. `welcome_code` lasts only 20
   seconds, so entry welcomes are best-effort on this bounded fast path and must
   not wait in an ordinary delayed queue.
6. Continue with `next_cursor` until `has_more == 0`, including when Tencent
   returns `has_more == 1` with an empty `msg_list`.
7. Deduplicate on Tencent `msgid`.
8. Commit the next cursor only after every page effect is durable.
9. Create the Chatwoot incoming message after the contact/conversation mapping
   is immutable.

`sync_msg` exposes only the last three days and does not echo messages sent by
`send_msg`, so every outbound payload and state must be persisted locally.

## Outbound state and account protection

```text
PENDING_APPROVAL → APPROVED → SENDING
                                  ├─ ACCEPTED
                                  ├─ FAILED_KNOWN
                                  └─ UNKNOWN
```

- Phase 1 uses `approved-only`: Codex writes a private Chatwoot draft; Alex
  approves the exact public message. Only allowlisted Chatwoot agent IDs count.
- `auto-safe` may send one exact fixed acknowledgement tied to a fresh inbound
  message. It may not send free-form model output, pricing, payment, legal,
  medical, or procurement commitments.
- A global kill switch overrides every send.
- Outbound is disabled unless `OUTBOUND_ENABLED` parses as the exact value
  `true`; missing or unknown configuration fails closed.
- A customer message opens a 48-hour reply window and resets Tencent's maximum
  of five business messages. The 48-hour anchor is Tencent's authenticated
  message `send_time`, never callback arrival, sync processing, or Chatwoot
  creation time. Automation reserves the fifth slot for a human.
- `kf/send_msg` is additionally restricted to Tencent service states `0`
  (unprocessed) and `1` (AI-served). States `2` (queued), `3` (human-served),
  and `4` (ended) fail closed. A later authenticated customer message or
  provider reopen event can reopen an ended conversation.
- Claim each Chatwoot message ID and reserve the recipient budget atomically
  before the Tencent network call. In one D1 atomic batch, insert the unique
  `SENDING` row and conditionally increment `outbound_count` only below the
  applicable limit. `ACCEPTED` and `UNKNOWN` retain the slot; only an explicit
  pre-network failure may release it.
- Bind automated acknowledgements to a unique fresh inbound Tencent `msgid`.
  The same inbound message can never trigger the fixed response twice.
- Store approval as a separate single-use record bound to the message ID,
  content hash, conversation, immutable Tencent recipient, approver, and
  expiration. Consume it atomically before dispatch.
- Resolve recipients only from the immutable authenticated Tencent mapping.
  Never trust user-editable Chatwoot fields, message text, a phone number, or a
  model-provided WeChat ID.
- Do not retry an ambiguous timeout or connection reset. Mark it `UNKNOWN`,
  alert privately, and freeze automated follow-ups until a human resolves it.
- Tencent `errcode=0` means accepted, not delivered. A later `msg_send_fail`
  event can change the result to failed.

## Runtime

Deploy as a Cloudflare Worker with D1 for strongly consistent contact mapping,
idempotency, cursor, send-budget, and audit records. Store every credential as a
Worker Secret and keep message bodies and external user IDs out of logs.

Before choosing Workers, check whether the WeCom application requires a trusted
fixed outbound IP. If it does, deploy the same service on a Node 22 host with
static egress instead.

## Modes

| Mode | Inbound | Outbound |
| --- | --- | --- |
| `draft` | Mirrored to Chatwoot | Never sent |
| `approved-only` | Mirrored | Exact human-approved reply |
| `auto-safe` | Mirrored | Fixed acknowledgement only; human approval for all other text |

Production starts in `draft`, moves to `approved-only` after recorded fixture
tests, then optionally enables `auto-safe`. Personal-WeChat automation is never
a mode.

## Official references

- [Tencent customer-service link](https://open.work.weixin.qq.com/api/doc/90000/90135/94665)
- [Tencent message synchronization](https://open.work.weixin.qq.com/api/doc/90000/90135/94670)
- [Tencent message sending](https://open.work.weixin.qq.com/api/doc/90000/90135/94677)
- [Tencent event response / welcome](https://open.work.weixin.qq.com/api/doc/90000/90135/95122)
- [Chatwoot API Inbox](https://www.chatwoot.com/hc/user-guide/articles/1677839703-how-to-create-an-api-channel-inbox)
- [Chatwoot contact-inbox binding](https://developers.chatwoot.com/api-reference/contacts/create-contact-inbox)
- [WeCom confirmed-send tasks](https://open.work.weixin.qq.com/api/doc/90000/90135/92135)
