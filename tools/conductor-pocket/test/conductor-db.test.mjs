import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConductorDatabase } from '../src/conductor-db.mjs';

async function createConfirmationFixture(context) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'conductor-pocket-confirmation-db-'),
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
      (
        id,
        repository_id,
        workspace_name,
        secondary_directory_name,
        placeholder_branch_name,
        branch,
        directory_name,
        workspace_path,
        sandbox_provider,
        state,
        unread,
        updated_at
      )
    VALUES
      (
        'workspace-1',
        'repo-1',
        NULL,
        'visible-workspace-name',
        'folder-codename',
        'feature/pocket',
        'folder-codename',
        '${directory.replaceAll("'", "''")}',
        'local',
        'ready',
        0,
        '2026-01-01'
      );
    INSERT INTO sessions
      (id, workspace_id, title, agent_type, model, status, unread_count, created_at, updated_at, is_hidden)
    VALUES
      ('session-1', 'workspace-1', 'First chat', 'codex', 'gpt-test', 'working', 0, '2026-01-01', '2026-01-01', 0),
      ('session-2', 'workspace-1', 'Second chat', 'codex', 'gpt-test', 'working', 0, '2026-01-01', '2026-01-01', 0);
  `);
  const database = new ConductorDatabase(dbPath);
  context.after(async () => {
    database.close();
    writable.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const insert = writable.prepare(`
    INSERT INTO session_messages
      (id, session_id, role, content, created_at, sent_at, cancelled_at, model, turn_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'gpt-test', 'turn-1')
  `);
  return { database, insert };
}

test('database adapter exposes sanitized chat events without tool payloads', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'conductor-pocket-db-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
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
  `);
  writable
    .prepare('INSERT INTO repos (id, name, hidden) VALUES (?, ?, 0)')
    .run('repo-1', 'Quickstart');
  writable
    .prepare(`
      INSERT INTO workspaces
        (id, repository_id, workspace_name, branch, directory_name, state, unread, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ready', 0, ?)
    `)
    .run('workspace-1', 'repo-1', 'Pocket test', 'feature/pocket', 'test', '2026-01-01');
  writable
    .prepare(`
      INSERT INTO sessions
        (id, workspace_id, title, agent_type, model, status, unread_count, created_at, updated_at, last_user_message_at, is_hidden)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0)
    `)
    .run(
      'session-1',
      'workspace-1',
      'Test chat',
      'codex',
      'gpt-test',
      'working',
      '2026-01-01',
      '2026-01-01',
      '2026-01-01',
    );
  const insert = writable.prepare(`
    INSERT INTO session_messages
      (id, session_id, role, content, created_at, sent_at, model, turn_id)
    VALUES (?, 'session-1', ?, ?, ?, ?, 'gpt-test', 'turn-1')
  `);
  insert.run('user-1', 'user', 'Hello from the phone', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  insert.run(
    'assistant-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello back.' }] },
    }),
    '2026-01-01T00:00:01Z',
    null,
  );
  insert.run(
    'tool-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-call-1',
            name: 'read_secret_file',
            input: { path: '/private/secret', token: 'must-not-leak' },
          },
        ],
      },
    }),
    '2026-01-01T00:00:02Z',
    null,
  );
  insert.run(
    'tool-result-1',
    'assistant',
    JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-call-1',
            content: 'highly sensitive output',
          },
        ],
      },
    }),
    '2026-01-01T00:00:03Z',
    null,
  );
  insert.run(
    'tool-failed-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-call-failed-1',
            name: 'private_failed_tool',
            input: { token: 'private failed input' },
          },
        ],
      },
    }),
    '2026-01-01T00:00:03Z',
    null,
  );
  insert.run(
    'tool-failed-result-1',
    'assistant',
    JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-call-failed-1',
            is_error: true,
            content: 'private root failure output',
          },
        ],
      },
    }),
    '2026-01-01T00:00:03Z',
    null,
  );
  insert.run(
    'nested-text-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: 'spawn-research-1',
      message: {
        content: [
          {
            type: 'text',
            text: 'Duplicated nested research should never be a main message.',
          },
        ],
      },
    }),
    '2026-01-01T00:00:04Z',
    null,
  );
  insert.run(
    'nested-malformed-error-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: 'spawn-research-1',
      is_error: true,
      message: {
        content: [
          {
            type: 'text',
            text: 'PRIVATE_NESTED_MALFORMED_ERROR_TEXT',
          },
        ],
      },
    }),
    '2026-01-01T00:00:04Z',
    null,
  );
  insert.run(
    'nested-failure-1',
    'assistant',
    JSON.stringify({
      type: 'user',
      parent_tool_use_id: 'spawn-research-1',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'nested-call-1',
            is_error: true,
            content: 'private nested failure output',
          },
        ],
      },
    }),
    '2026-01-01T00:00:05Z',
    null,
  );
  insert.run(
    'assistant-final-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'This is the finished answer.' }],
      },
    }),
    '2026-01-01T00:00:06Z',
    null,
  );
  insert.run(
    'turn-result-1',
    'assistant',
    JSON.stringify({
      type: 'result',
      is_error: false,
    }),
    '2026-01-01T00:00:07Z',
    null,
  );
  writable.close();

  const database = new ConductorDatabase(dbPath);
  context.after(() => database.close());
  const workspaces = database.listWorkspaces();
  assert.equal(workspaces[0].name, 'Pocket test');
  assert.equal(workspaces[0].workingCount, 1);
  assert.equal(database.listSessions('workspace-1')[0].title, 'Test chat');

  const result = database.listMessages('session-1');
  assert.equal(result.messages.some((message) => message.text === 'Hello back.'), true);
  assert.equal(
    result.messages.some((message) => message.name === 'Read Secret File'),
    true,
  );
  assert.equal(
    result.messages.some(
      (message) =>
        message.text ===
        'Duplicated nested research should never be a main message.',
    ),
    false,
  );
  assert.equal(
    result.messages.some(
      (message) =>
        message.kind === 'agent-error' &&
        message.code === 'background_action_failed',
    ),
    true,
  );
  assert.equal(
    result.messages.some(
      (message) =>
        message.kind === 'tool-failure' &&
        message.code === 'tool_action_failed',
    ),
    true,
  );
  assert.equal(
    result.messages.some(
      (message) =>
        message.kind === 'turn-result' && message.state === 'complete',
    ),
    true,
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal(serialized.includes('highly sensitive output'), false);
  assert.equal(serialized.includes('private nested failure output'), false);
  assert.equal(serialized.includes('private root failure output'), false);
  assert.equal(serialized.includes('private failed input'), false);
  assert.equal(
    serialized.includes('PRIVATE_NESTED_MALFORMED_ERROR_TEXT'),
    false,
  );
});

test('workspace routes use the visible Conductor name instead of the folder codename', async (context) => {
  const { database } = await createConfirmationFixture(context);
  assert.equal(database.listWorkspaces()[0].name, 'visible workspace name');
  assert.equal(
    database.listRecentSessions(1)[0].workspaceName,
    'visible workspace name',
  );
  assert.equal(
    database.getSessionRoute('session-1').workspaceName,
    'visible workspace name',
  );
  assert.equal(database.listLocalWorkspacePaths().length, 1);
  assert.equal(path.isAbsolute(database.listLocalWorkspacePaths()[0]), true);
});

test('cancelled rows stay hidden while the high-water cursor still fences them', async (context) => {
  const { database, insert } = await createConfirmationFixture(context);
  insert.run(
    'visible-queued',
    'session-1',
    'user',
    'Visible queued message',
    '2026-01-01T00:00:01Z',
    null,
    null,
  );
  const visibleCursor = database.getSessionMessageCursor('session-1');
  insert.run(
    'cancelled-newer',
    'session-1',
    'user',
    'Cancelled message',
    '2026-01-01T00:00:02Z',
    null,
    '2026-01-01T00:00:03Z',
  );

  const session = database.listSessions('workspace-1').find(
    (candidate) => candidate.id === 'session-1',
  );
  const transcript = database.listMessages('session-1');
  const highWaterCursor = database.getSessionMessageCursor('session-1');
  const incremental = database.listMessages('session-1', {
    after: visibleCursor,
  });

  assert.equal(session.queuedCount, 1);
  assert.ok(highWaterCursor > visibleCursor);
  assert.equal(
    transcript.messages.some((message) => message.text === 'Cancelled message'),
    false,
  );
  assert.equal(transcript.cursor, visibleCursor);
  assert.deepEqual(incremental.messages, []);
  assert.equal(incremental.cursor, highWaterCursor);
});

test('large-database queries keep the indexed sent and cancellation predicates', async () => {
  const source = await fs.readFile(
    new URL('../src/conductor-db.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /queued\.sent_at IS NULL[\s\S]*\+queued\.cancelled_at IS NULL/);
  assert.match(source, /WHERE session_id = \? AND cancelled_at IS NULL/);
  assert.match(
    source,
    /WHERE session_id = \? AND cancelled_at IS NULL AND rowid > \?/,
  );
  assert.match(
    source,
    /SELECT MAX\(rowid\) AS row_id[\s\S]*INDEXED BY idx_session_messages_cancelled_at[\s\S]*cancelled_at IS NULL[\s\S]*UNION ALL[\s\S]*cancelled_at IS NOT NULL/,
  );
});

test('nested deep-research rows are filtered before the visible limit', async (context) => {
  const { database, insert } = await createConfirmationFixture(context);
  insert.run(
    'root-progress',
    'session-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Root progress' }] },
    }),
    '2026-01-01T00:00:01Z',
    null,
    null,
  );
  for (let index = 0; index < 600; index += 1) {
    insert.run(
      `nested-replay-${index}`,
      'session-1',
      'assistant',
      JSON.stringify({
        type: 'assistant',
        parent_tool_use_id: 'spawn-deep-research',
        message: {
          content: [{ type: 'text', text: `Nested replay ${index}` }],
        },
      }),
      '2026-01-01T00:00:02Z',
      null,
      null,
    );
  }
  for (let index = 0; index < 600; index += 1) {
    insert.run(
      `root-status-${index}`,
      'session-1',
      'assistant',
      JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
      }),
      '2026-01-01T00:00:02Z',
      null,
      null,
    );
  }
  insert.run(
    'root-final',
    'session-1',
    'assistant',
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Root final' }] },
    }),
    '2026-01-01T00:00:03Z',
    null,
    null,
  );
  insert.run(
    'root-result',
    'session-1',
    'assistant',
    JSON.stringify({ type: 'result', is_error: false }),
    '2026-01-01T00:00:04Z',
    null,
    null,
  );

  const result = database.listMessages('session-1', { limit: 3 });
  assert.deepEqual(
    result.messages.map((message) => message.kind),
    ['assistant', 'assistant', 'turn-result'],
  );
  assert.deepEqual(
    result.messages
      .filter((message) => message.kind === 'assistant')
      .map((message) => message.text),
    ['Root progress', 'Root final'],
  );
});

test('send confirmation ignores old, inexact, foreign, non-user, and cancelled rows', async (context) => {
  const { database, insert } = await createConfirmationFixture(context);
  const exactContent = 'Exact\nmessage with trailing space ';
  insert.run(
    'old-exact',
    'session-1',
    'user',
    exactContent,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z',
    null,
  );

  const cursor = database.getSessionMessageCursor('session-1');
  assert.ok(cursor > 0);
  assert.equal(database.getSessionMessageCursor('session-2'), 0);
  assert.equal(
    database.findExactUserMessageAfter('session-1', cursor, exactContent),
    null,
  );

  insert.run(
    'assistant-exact',
    'session-1',
    'assistant',
    exactContent,
    '2026-01-01T00:00:01Z',
    null,
    null,
  );
  insert.run(
    'foreign-exact',
    'session-2',
    'user',
    exactContent,
    '2026-01-01T00:00:02Z',
    null,
    null,
  );
  insert.run(
    'case-difference',
    'session-1',
    'user',
    'exact\nmessage with trailing space ',
    '2026-01-01T00:00:03Z',
    null,
    null,
  );
  insert.run(
    'whitespace-difference',
    'session-1',
    'user',
    'Exact\nmessage with trailing space',
    '2026-01-01T00:00:04Z',
    null,
    null,
  );
  insert.run(
    'newline-difference',
    'session-1',
    'user',
    'Exact\r\nmessage with trailing space ',
    '2026-01-01T00:00:05Z',
    null,
    null,
  );
  insert.run(
    'cancelled-exact',
    'session-1',
    'user',
    exactContent,
    '2026-01-01T00:00:06Z',
    null,
    '2026-01-01T00:00:07Z',
  );

  assert.equal(
    database.findExactUserMessageAfter('session-1', cursor, exactContent),
    null,
  );
});

test('send confirmation sees a newly inserted exact queued user row on the live connection', async (context) => {
  const { database, insert } = await createConfirmationFixture(context);
  const exactContent = 'Queued from Pocket';
  const cursor = database.getSessionMessageCursor('session-1');

  insert.run(
    'queued-exact',
    'session-1',
    'user',
    exactContent,
    '2026-01-01T00:00:01Z',
    null,
    null,
  );

  const match = database.findExactUserMessageAfter(
    'session-1',
    cursor,
    exactContent,
  );
  assert.equal(match.id, 'queued-exact');
  assert.ok(match.rowId > cursor);
  assert.equal(match.sentAt, null);
  assert.deepEqual(
    database
      .listUserMessagesAfter('session-1', cursor)
      .map((message) => message.id),
    ['queued-exact'],
  );
});
