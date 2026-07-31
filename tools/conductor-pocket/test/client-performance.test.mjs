import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

async function applicationSource() {
  return fs.readFile(
    new URL('../public/app.js', import.meta.url),
    'utf8',
  );
}

function functionSource(source, name, nextName) {
  const start = source.indexOf(`${name}(`);
  const end = source.indexOf(`${nextName}(`, start + name.length);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test('warm chat navigation paints before cache or network work', async () => {
  const source = await applicationSource();
  const openSession = functionSource(
    source,
    'async function openSession',
    'async function refreshMessages',
  );

  assert.match(openSession, /state\.sessionOpenController\?\.abort\(\)/);
  assert.match(openSession, /const controller = new AbortController\(\)/);
  const paint = openSession.indexOf('renderTranscript();');
  const cacheRead = openSession.indexOf(
    'cacheGet(`messages:${sessionId}`)',
  );
  const refresh = openSession.indexOf('await refreshMessages');
  assert.ok(paint >= 0);
  assert.ok(cacheRead > paint);
  assert.ok(refresh > paint);
  assert.match(
    openSession,
    /if \(hasMemorySnapshot && hasLiveBaseline\)[\s\S]*refreshMessages\(sessionId, \{[\s\S]*signal: controller\.signal[\s\S]*\}\)[\s\S]*else \{[\s\S]*full: true/,
  );
  assert.match(
    source,
    /full \|\| !state\.messageBaselinesBySession\.has\(sessionId\)/,
  );
});

test('live data paints before noncritical snapshot persistence', async () => {
  const source = await applicationSource();
  const refreshMessages = functionSource(
    source,
    'async function refreshMessages',
    'function dedupeMessages',
  );
  const paint = refreshMessages.indexOf('renderTranscript()');
  const persistence = refreshMessages.indexOf(
    'void cacheSet(`messages:${sessionId}`',
  );

  assert.ok(paint >= 0);
  assert.ok(persistence > paint);
  assert.match(source, /renderWorkspacePanel\(\);\s*void cacheSet\('workspaces'/);
  assert.match(source, /renderSessionsPanel\(\);\s*void cacheSet\(`sessions:/);
});

test('collapsed activity defers hidden Markdown DOM until expansion', async () => {
  const source = await applicationSource();
  const renderActivity = functionSource(
    source,
    'function renderActivity',
    'function renderAgentStatus',
  );

  assert.match(renderActivity, /function populateItems\(\)/);
  assert.match(renderActivity, /if \(expanded\) populateItems\(\)/);
  assert.match(
    renderActivity,
    /if \(nextExpanded\) populateItems\(\)/,
  );
});

test('background failure bursts paint one counted lazy disclosure', async () => {
  const source = await applicationSource();
  const renderTranscript = functionSource(
    source,
    'function renderTranscript',
    'function isMessageContinuation',
  );
  const renderKey = functionSource(
    source,
    'function messageRenderKey',
    'function renderBanner',
  );
  const renderMessage = functionSource(
    source,
    'function renderMessage',
    'function renderActivity',
  );
  const renderActivity = functionSource(
    source,
    'function renderActivity',
    'function renderAgentStatus',
  );

  assert.match(renderKey, /message\.backgroundErrorCount[\s\S]*expanded/);
  assert.match(renderKey, /item\.occurrenceCount/);
  assert.match(
    renderTranscript,
    /announcementId = `\$\{messageId\}:background-errors`[\s\S]*seenMessageIds\.add\(announcementId\)/,
  );
  assert.match(
    renderMessage,
    /occurrenceCount > 1[\s\S]*background actions failed[\s\S]*private action details/,
  );
  assert.match(renderActivity, /hasErrors[\s\S]*icon\('warn'\)/);
  assert.match(renderActivity, /if \(expanded\) populateItems\(\)/);
});

test('streaming transcript and metadata refresh on separate schedules', async () => {
  const source = await applicationSource();
  assert.match(
    source,
    /const transcriptRefresh = createLiveRefreshCoordinator\(\{[\s\S]*delayMs: LIVE_REFRESH_DEBOUNCE_MS/,
  );
  assert.match(
    source,
    /const metadataRefresh = createLiveRefreshCoordinator\(\{[\s\S]*delayMs: METADATA_REFRESH_DEBOUNCE_MS/,
  );
  assert.match(
    source,
    /eventSource\.addEventListener\('change'[\s\S]*transcriptRefresh\.schedule\(\)[\s\S]*metadataRefresh\.schedule\(\)/,
  );
});
