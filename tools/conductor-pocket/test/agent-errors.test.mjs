import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  classifyAgentError,
  ConductorDatabase,
} from '../src/conductor-db.mjs';

test('agent errors use closed server-authored copy without provider details', () => {
  const error = classifyAgentError({
    type: 'error',
    content: 'Rate limit reached PRIVATE_PROVIDER_DETAIL',
    errorInfo: 'PRIVATE_ACCOUNT_IDENTIFIER',
    additionalDetails: 'PRIVATE_RECONNECT_URL',
    willRetry: false,
  });

  assert.deepEqual(error, {
    code: 'usage_limit',
    severity: 'error',
    title: 'Account limit reached',
    guidance: 'Open Conductor on the Mac to switch accounts or review limits.',
    retrying: false,
  });
  const serialized = JSON.stringify(error);
  assert.equal(serialized.includes('PRIVATE_PROVIDER_DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE_ACCOUNT_IDENTIFIER'), false);
  assert.equal(serialized.includes('PRIVATE_RECONNECT_URL'), false);
  assert.deepEqual(
    classifyAgentError({
      type: 'system',
      subtype: 'permission_denied',
      content: 'PRIVATE_PERMISSION_DETAIL',
    }),
    {
      code: 'permission_required',
      severity: 'error',
      title: 'Permission required',
      guidance: 'Open Conductor on the Mac to approve the requested permission.',
      retrying: false,
    },
  );
});

test('database adapter emits normalized failures and never raw diagnostics', async (context) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-agent-errors-'),
  );
  const dbPath = path.join(directory, 'conductor.db');
  const writable = new DatabaseSync(dbPath);
  writable.exec(`
    CREATE TABLE repos (
      id TEXT PRIMARY KEY,
      name TEXT,
      hidden INTEGER DEFAULT 0
    );
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      repository_id TEXT,
      workspace_name TEXT,
      secondary_directory_name TEXT,
      placeholder_branch_name TEXT,
      branch TEXT,
      directory_name TEXT,
      workspace_path TEXT,
      sandbox_provider TEXT,
      state TEXT,
      unread INTEGER,
      pinned_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      title TEXT,
      agent_type TEXT,
      model TEXT,
      status TEXT,
      unread_count INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_user_message_at TEXT,
      context_used_percent REAL,
      queue_paused_at TEXT,
      is_hidden INTEGER DEFAULT 0
    );
    CREATE TABLE session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      role TEXT,
      content TEXT,
      created_at TEXT,
      sent_at TEXT,
      cancelled_at TEXT,
      model TEXT,
      turn_id TEXT
    );
    CREATE INDEX idx_session_messages_sent_at
      ON session_messages(session_id, sent_at);
    CREATE INDEX idx_session_messages_cancelled_at
      ON session_messages(session_id, cancelled_at);
    INSERT INTO repos (id, name, hidden)
      VALUES ('repo-1', 'Quickstart', 0);
    INSERT INTO workspaces
      (id, repository_id, workspace_name, state, unread, updated_at)
      VALUES ('workspace-1', 'repo-1', 'Pocket errors', 'ready', 0, '2026-01-01');
    INSERT INTO sessions
      (
        id,
        workspace_id,
        title,
        agent_type,
        model,
        status,
        unread_count,
        created_at,
        updated_at,
        is_hidden
      )
      VALUES
      (
        'session-1',
        'workspace-1',
        'Error chat',
        'codex',
        'gpt-test',
        'error',
        0,
        '2026-01-01',
        '2026-01-01',
        0
      );
  `);
  const insert = writable.prepare(`
    INSERT INTO session_messages
      (id, session_id, role, content, created_at, model, turn_id)
    VALUES (?, 'session-1', 'assistant', ?, ?, 'gpt-test', 'turn-1')
  `);
  insert.run(
    'error-1',
    JSON.stringify({
      type: 'error',
      content: 'Unauthorized PRIVATE_AUTH_RESPONSE',
      errorInfo: 'PRIVATE_ACCOUNT_IDENTIFIER',
      willRetry: false,
    }),
    '2026-01-01T00:00:01Z',
  );
  insert.run(
    'error-2',
    JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'Model unavailable PRIVATE_MODEL_IDENTIFIER',
      subtype: 'error',
    }),
    '2026-01-01T00:00:02Z',
  );
  insert.run(
    'error-3',
    JSON.stringify({
      type: 'system',
      subtype: 'permission_denied',
      content: 'PRIVATE_PERMISSION_DETAIL',
    }),
    '2026-01-01T00:00:03Z',
  );
  insert.run(
    'error-4',
    JSON.stringify({
      type: 'system',
      subtype: 'api_retry',
      additionalDetails: 'PRIVATE_RETRY_DETAIL',
    }),
    '2026-01-01T00:00:04Z',
  );
  insert.run(
    'error-5',
    JSON.stringify({
      type: 'stream_error',
      content: 'Service unavailable PRIVATE_STREAM_DETAIL',
    }),
    '2026-01-01T00:00:05Z',
  );
  insert.run(
    'error-6',
    JSON.stringify({
      type: 'system',
      status: 'permission_denied',
      parent_tool_use_id: 'spawn-private',
      content: 'PRIVATE_NESTED_PERMISSION_DETAIL',
    }),
    '2026-01-01T00:00:06Z',
  );
  const database = new ConductorDatabase(dbPath);
  context.after(async () => {
    database.close();
    writable.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const result = database.listMessages('session-1');
  assert.deepEqual(
    result.messages
      .filter((message) => message.kind === 'agent-error')
      .map((message) => message.code),
    [
      'provider_auth_required',
      'model_unavailable',
      'permission_required',
      'provider_reconnecting',
      'provider_unavailable',
      'permission_required',
    ],
  );
  assert.equal(
    result.messages.some(
      (message) =>
        message.kind === 'turn-result' && message.state === 'failed',
    ),
    true,
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('PRIVATE_AUTH_RESPONSE'), false);
  assert.equal(serialized.includes('PRIVATE_ACCOUNT_IDENTIFIER'), false);
  assert.equal(serialized.includes('PRIVATE_MODEL_IDENTIFIER'), false);
  assert.equal(serialized.includes('PRIVATE_PERMISSION_DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE_RETRY_DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE_STREAM_DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE_NESTED_PERMISSION_DETAIL'), false);
});
