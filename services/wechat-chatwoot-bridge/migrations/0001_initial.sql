PRAGMA foreign_keys = ON;

CREATE TABLE suppliers (
  supplier_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  scene_token_hash TEXT NOT NULL UNIQUE,
  scene_expires_at INTEGER NOT NULL,
  scene_consumed_at INTEGER,
  bound_open_kfid TEXT,
  bound_external_userid TEXT,
  chatwoot_contact_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(scene_consumed_at IS NULL OR (
    bound_open_kfid IS NOT NULL AND bound_external_userid IS NOT NULL
  )),
  UNIQUE(supplier_id, bound_open_kfid, bound_external_userid)
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id TEXT,
  open_kfid TEXT NOT NULL,
  external_userid TEXT NOT NULL,
  chatwoot_conversation_id INTEGER,
  chatwoot_source_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN (
    'PRECREATED',
    'ENTERED_UNMESSAGED',
    'WELCOME_SENT',
    'WELCOME_EXPIRED',
    'OPEN_WINDOW',
    'EXHAUSTED',
    'EXPIRED',
    'CLOSED'
  )),
  service_state INTEGER CHECK(service_state IS NULL OR service_state BETWEEN 0 AND 4),
  last_customer_message_sent_at INTEGER,
  outbound_count INTEGER NOT NULL DEFAULT 0 CHECK(outbound_count BETWEEN 0 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(open_kfid, external_userid),
  UNIQUE(id, open_kfid, external_userid),
  FOREIGN KEY(supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY(supplier_id, open_kfid, external_userid)
    REFERENCES suppliers(supplier_id, bound_open_kfid, bound_external_userid)
);

CREATE TABLE sync_cursors (
  open_kfid TEXT PRIMARY KEY,
  cursor TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE callback_receipts (
  receipt_key TEXT PRIMARY KEY,
  open_kfid TEXT,
  received_at INTEGER NOT NULL
);

CREATE TABLE inbound_messages (
  tencent_msgid TEXT PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  chatwoot_message_id INTEGER,
  provider_sent_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE(tencent_msgid, conversation_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE outbound_approvals (
  approval_id TEXT PRIMARY KEY,
  chatwoot_message_id INTEGER NOT NULL UNIQUE,
  content_sha256 TEXT NOT NULL,
  conversation_id INTEGER NOT NULL,
  open_kfid TEXT NOT NULL,
  external_userid TEXT NOT NULL,
  approver_id INTEGER NOT NULL,
  approved_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  CHECK(expires_at > approved_at),
  UNIQUE(
    approval_id,
    chatwoot_message_id,
    content_sha256,
    conversation_id,
    open_kfid,
    external_userid,
    approver_id
  ),
  FOREIGN KEY(conversation_id, open_kfid, external_userid)
    REFERENCES conversations(id, open_kfid, external_userid)
);

CREATE TABLE outbound_messages (
  chatwoot_message_id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  tencent_msgid TEXT NOT NULL UNIQUE,
  open_kfid TEXT NOT NULL,
  external_userid TEXT NOT NULL,
  approval_id TEXT,
  trigger_inbound_msgid TEXT,
  automated_kind TEXT CHECK(automated_kind IS NULL OR automated_kind = 'fixed_ack'),
  approver_id INTEGER,
  status TEXT NOT NULL CHECK(status IN (
    'PENDING_APPROVAL',
    'APPROVED',
    'SENDING',
    'ACCEPTED',
    'FAILED_KNOWN',
    'UNKNOWN'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  provider_error_code INTEGER,
  provider_error_message TEXT,
  accepted_at INTEGER,
  failed_at INTEGER,
  unknown_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(
    (trigger_inbound_msgid IS NULL AND automated_kind IS NULL) OR
    (trigger_inbound_msgid IS NOT NULL AND automated_kind IS NOT NULL)
  ),
  CHECK(
    (
      status = 'PENDING_APPROVAL' AND
      approval_id IS NULL AND
      trigger_inbound_msgid IS NULL AND
      approver_id IS NULL
    ) OR (
      status <> 'PENDING_APPROVAL' AND (
        (
          approval_id IS NOT NULL AND
          trigger_inbound_msgid IS NULL AND
          approver_id IS NOT NULL
        ) OR (
          approval_id IS NULL AND
          trigger_inbound_msgid IS NOT NULL AND
          approver_id IS NULL
        )
      )
    )
  ),
  FOREIGN KEY(conversation_id, open_kfid, external_userid)
    REFERENCES conversations(id, open_kfid, external_userid),
  FOREIGN KEY(
    approval_id,
    chatwoot_message_id,
    content_sha256,
    conversation_id,
    open_kfid,
    external_userid,
    approver_id
  ) REFERENCES outbound_approvals(
    approval_id,
    chatwoot_message_id,
    content_sha256,
    conversation_id,
    open_kfid,
    external_userid,
    approver_id
  ),
  FOREIGN KEY(trigger_inbound_msgid, conversation_id)
    REFERENCES inbound_messages(tencent_msgid, conversation_id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_conversations_supplier ON conversations(supplier_id);
CREATE UNIQUE INDEX idx_conversations_chatwoot
  ON conversations(chatwoot_conversation_id)
  WHERE chatwoot_conversation_id IS NOT NULL;
CREATE INDEX idx_inbound_conversation ON inbound_messages(conversation_id);
CREATE INDEX idx_outbound_conversation ON outbound_messages(conversation_id);
CREATE INDEX idx_outbound_status ON outbound_messages(status);
CREATE UNIQUE INDEX idx_outbound_approval
  ON outbound_messages(approval_id)
  WHERE approval_id IS NOT NULL;
CREATE UNIQUE INDEX idx_outbound_auto_trigger
  ON outbound_messages(conversation_id, trigger_inbound_msgid, automated_kind)
  WHERE trigger_inbound_msgid IS NOT NULL AND automated_kind IS NOT NULL;
CREATE UNIQUE INDEX idx_supplier_bound_recipient
  ON suppliers(bound_open_kfid, bound_external_userid)
  WHERE bound_open_kfid IS NOT NULL AND bound_external_userid IS NOT NULL;

CREATE TRIGGER prevent_supplier_binding_remap
BEFORE UPDATE OF
  scene_token_hash,
  scene_consumed_at,
  bound_open_kfid,
  bound_external_userid
ON suppliers
WHEN OLD.scene_consumed_at IS NOT NULL AND (
  OLD.scene_token_hash IS NOT NEW.scene_token_hash OR
  OLD.scene_consumed_at IS NOT NEW.scene_consumed_at OR
  OLD.bound_open_kfid IS NOT NEW.bound_open_kfid OR
  OLD.bound_external_userid IS NOT NEW.bound_external_userid
)
BEGIN
  SELECT RAISE(ABORT, 'consumed supplier binding is immutable');
END;

CREATE TRIGGER prevent_conversation_recipient_remap
BEFORE UPDATE OF open_kfid, external_userid ON conversations
WHEN OLD.open_kfid <> NEW.open_kfid OR OLD.external_userid <> NEW.external_userid
BEGIN
  SELECT RAISE(ABORT, 'recipient mapping is immutable');
END;
