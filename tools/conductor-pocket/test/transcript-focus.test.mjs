import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityLabel,
  buildFocusedTranscript,
} from '../public/transcript-focus.js';

const user = (id, rowId, turnId) => ({
  id,
  rowId,
  kind: 'user',
  text: id,
  turnId,
});
const assistant = (id, rowId, turnId, parentToolUseId = null) => ({
  id,
  rowId,
  kind: 'assistant',
  text: id,
  turnId,
  parentToolUseId,
});

test('completed turns collapse progress and keep every final text block prominent', () => {
  const messages = [
    user('question', 1, 'turn-1'),
    assistant('progress', 2, 'turn-1'),
    {
      id: 'tool',
      rowId: 3,
      kind: 'tool',
      toolCallId: 'call-1',
      state: 'running',
      turnId: 'turn-1',
    },
    {
      id: 'tool-result',
      rowId: 4,
      kind: 'tool-result',
      toolCallId: 'call-1',
      state: 'completed',
      turnId: 'turn-1',
    },
    assistant('final-block-a', 5, 'turn-1'),
    assistant('final-block-b', 5, 'turn-1'),
    {
      id: 'result',
      rowId: 6,
      kind: 'turn-result',
      state: 'complete',
      turnId: 'turn-1',
    },
  ];

  const { entries } = buildFocusedTranscript(messages, {
    sessionStatus: 'idle',
  });

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'activity', 'assistant', 'assistant'],
  );
  assert.equal(entries[1].messageCount, 1);
  assert.equal(entries[1].toolCount, 1);
  assert.equal(entries[1].running, false);
  assert.equal(entries[2].importance, 'primary');
  assert.equal(entries[3].importance, 'primary');
  assert.equal(activityLabel(entries[1]), '1 tool call, 1 message');
});

test('an active turn has no manufactured final answer', () => {
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-active'),
      assistant('first update', 2, 'turn-active'),
      assistant('newest update', 3, 'turn-active'),
    ],
    { sessionStatus: 'working' },
  );

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'activity'],
  );
  assert.equal(entries[1].messageCount, 2);
  assert.equal(entries[1].running, true);
  assert.equal(
    entries.some(
      (entry) => entry.kind === 'assistant' && entry.importance === 'primary',
    ),
    false,
  );
});

test('a terminal marker promotes the newest root answer on the next refresh', () => {
  const partial = [
    user('question', 1, 'turn-streaming'),
    assistant('working update', 2, 'turn-streaming'),
  ];
  assert.equal(
    buildFocusedTranscript(partial, { sessionStatus: 'working' }).entries[1]
      .kind,
    'activity',
  );

  const complete = [
    ...partial,
    assistant('finished answer', 3, 'turn-streaming'),
    {
      id: 'result',
      rowId: 4,
      kind: 'turn-result',
      state: 'complete',
      turnId: 'turn-streaming',
    },
  ];
  const { entries } = buildFocusedTranscript(complete, {
    sessionStatus: 'idle',
  });
  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.text || null]),
    [
      ['user', 'question'],
      ['activity', null],
      ['assistant', 'finished answer'],
    ],
  );
});

test('nested research prose is suppressed while failures stay visibly compact', () => {
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-research'),
      assistant('nested replay', 2, 'turn-research', 'spawn-1'),
      {
        id: 'failed-tool',
        rowId: 3,
        kind: 'tool',
        toolCallId: 'call-failed',
        state: 'running',
        turnId: 'turn-research',
      },
      {
        id: 'failed-result',
        rowId: 4,
        kind: 'tool-result',
        toolCallId: 'call-failed',
        state: 'failed',
        turnId: 'turn-research',
      },
      {
        id: 'background-error',
        rowId: 5,
        kind: 'agent-error',
        code: 'background_action_failed',
        title: 'Background action failed',
        turnId: 'turn-research',
        parentToolUseId: 'spawn-1',
      },
    ],
    { sessionStatus: 'error' },
  );

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'tool', 'activity'],
  );
  assert.equal(entries[1].resolvedState, 'failed');
  assert.equal(entries[2].backgroundErrorCount, 1);
  assert.equal(activityLabel(entries[2]), '1 background failure');
  assert.equal(
    entries.some((entry) => entry.text === 'nested replay'),
    false,
  );
});

test('repeated failed Bash calls collapse into one counted activity disclosure', () => {
  const failedBashCalls = Array.from({ length: 20 }, (_, index) => {
    const rowId = index * 2 + 3;
    return [
      {
        id: `bash-${index + 1}`,
        rowId,
        kind: 'tool',
        toolCallId: `bash-call-${index + 1}`,
        name: 'Bash',
        state: 'running',
        turnId: 'turn-bash-failures',
      },
      {
        id: `bash-result-${index + 1}`,
        rowId: rowId + 1,
        kind: 'tool-result',
        toolCallId: `bash-call-${index + 1}`,
        state: 'failed',
        turnId: 'turn-bash-failures',
      },
    ];
  }).flat();
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-bash-failures'),
      assistant('checking', 2, 'turn-bash-failures'),
      ...failedBashCalls,
      assistant('final answer', 43, 'turn-bash-failures'),
      {
        id: 'bash-turn-result',
        rowId: 44,
        kind: 'turn-result',
        state: 'complete',
        turnId: 'turn-bash-failures',
      },
    ],
    { sessionStatus: 'idle' },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.text || null]),
    [
      ['user', 'question'],
      ['activity', null],
      ['assistant', 'final answer'],
    ],
  );
  const activity = entries[1];
  assert.equal(activity.failedToolCount, 20);
  assert.equal(activity.toolCount, 20);
  assert.equal(activity.items.length, 2);
  assert.equal(activity.items[1].name, 'Bash');
  assert.equal(activity.items[1].occurrenceCount, 20);
  assert.equal(
    activityLabel(activity),
    '20 Bash failures, 1 message',
  );
});

test('isolated and non-Bash tool failures stay standalone', () => {
  const { entries } = buildFocusedTranscript([
    user('question', 1, 'turn-isolated-failures'),
    {
      id: 'single-bash',
      rowId: 2,
      kind: 'tool',
      toolCallId: 'single-bash-call',
      name: 'Bash',
      state: 'running',
      turnId: 'turn-isolated-failures',
    },
    {
      id: 'single-bash-result',
      rowId: 3,
      kind: 'tool-result',
      toolCallId: 'single-bash-call',
      state: 'failed',
      turnId: 'turn-isolated-failures',
    },
    {
      id: 'failed-edit',
      rowId: 4,
      kind: 'tool',
      toolCallId: 'failed-edit-call',
      name: 'Edit',
      state: 'running',
      turnId: 'turn-isolated-failures',
    },
    {
      id: 'failed-edit-result',
      rowId: 5,
      kind: 'tool-result',
      toolCallId: 'failed-edit-call',
      state: 'failed',
      turnId: 'turn-isolated-failures',
    },
  ]);

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.name || null]),
    [
      ['user', null],
      ['tool', 'Bash'],
      ['tool', 'Edit'],
    ],
  );
  assert.equal(entries[1].resolvedState, 'failed');
  assert.equal(entries[2].resolvedState, 'failed');
});

test('repeated Bash compaction preserves meaningful errors in scan order', () => {
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-ordered-failures'),
      {
        id: 'ordered-bash-1',
        rowId: 2,
        kind: 'tool',
        toolCallId: 'ordered-bash-call-1',
        name: 'Bash',
        state: 'running',
        turnId: 'turn-ordered-failures',
      },
      {
        id: 'ordered-bash-result-1',
        rowId: 3,
        kind: 'tool-result',
        toolCallId: 'ordered-bash-call-1',
        state: 'failed',
        turnId: 'turn-ordered-failures',
      },
      {
        id: 'ordered-account-error',
        rowId: 4,
        kind: 'agent-error',
        code: 'usage_limit',
        title: 'Account limit reached',
        turnId: 'turn-ordered-failures',
      },
      {
        id: 'ordered-bash-2',
        rowId: 5,
        kind: 'tool',
        toolCallId: 'ordered-bash-call-2',
        name: 'Bash',
        state: 'running',
        turnId: 'turn-ordered-failures',
      },
      {
        id: 'ordered-bash-result-2',
        rowId: 6,
        kind: 'tool-result',
        toolCallId: 'ordered-bash-call-2',
        state: 'failed',
        turnId: 'turn-ordered-failures',
      },
      assistant('final answer', 7, 'turn-ordered-failures'),
      {
        id: 'ordered-result',
        rowId: 8,
        kind: 'turn-result',
        state: 'complete',
        turnId: 'turn-ordered-failures',
      },
    ],
    { sessionStatus: 'idle' },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.id]),
    [
      ['user', 'question'],
      ['activity', 'activity:turn-ordered-failures:ordered-bash-1'],
      ['agent-error', 'ordered-account-error'],
      ['activity', 'activity:turn-ordered-failures:ordered-bash-2'],
      ['assistant', 'final answer'],
    ],
  );
  assert.equal(entries[1].failedToolCount, 1);
  assert.equal(entries[3].failedToolCount, 1);
});

test('duplicate Bash rows do not inflate a real repeated-failure burst', () => {
  const duplicate = {
    id: 'duplicate-bash',
    rowId: 2,
    kind: 'tool',
    toolCallId: 'duplicate-bash-call',
    name: 'Bash',
    state: 'running',
    turnId: 'turn-duplicate-bash',
  };
  const { entries } = buildFocusedTranscript([
    user('question', 1, 'turn-duplicate-bash'),
    duplicate,
    { ...duplicate, id: 'duplicate-bash-replay', rowId: 3 },
    {
      id: 'duplicate-bash-result',
      rowId: 4,
      kind: 'tool-result',
      toolCallId: 'duplicate-bash-call',
      state: 'failed',
      turnId: 'turn-duplicate-bash',
    },
    {
      id: 'distinct-bash',
      rowId: 5,
      kind: 'tool',
      toolCallId: 'distinct-bash-call',
      name: 'Bash',
      state: 'running',
      turnId: 'turn-duplicate-bash',
    },
    {
      id: 'distinct-bash-result',
      rowId: 6,
      kind: 'tool-result',
      toolCallId: 'distinct-bash-call',
      state: 'failed',
      turnId: 'turn-duplicate-bash',
    },
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'activity'],
  );
  assert.equal(entries[1].failedToolCount, 2);
  assert.equal(entries[1].toolCount, 2);
  assert.equal(entries[1].items.length, 1);
  assert.equal(entries[1].items[0].occurrenceCount, 2);
});

test('repeated background failures collapse into one counted activity item', () => {
  const backgroundFailures = Array.from({ length: 20 }, (_, index) => ({
    id: `background-error-${index + 1}`,
    rowId: index + 3,
    kind: 'agent-error',
    code: 'background_action_failed',
    severity: 'error',
    title: 'Background action failed',
    guidance:
      'A background Conductor action failed. Open the turn on your Mac for full details.',
    turnId: 'turn-research',
    parentToolUseId: `spawn-${index + 1}`,
  }));
  const rootFailure = {
    id: 'root-error',
    rowId: 24,
    kind: 'agent-error',
    code: 'usage_limit',
    severity: 'error',
    title: 'Account limit reached',
    turnId: 'turn-research',
    parentToolUseId: null,
  };
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-research'),
      assistant('root progress', 2, 'turn-research'),
      ...backgroundFailures,
      { ...backgroundFailures[0] },
      {
        id: 'nested-result',
        rowId: 23,
        kind: 'turn-result',
        state: 'failed',
        turnId: 'turn-research',
        parentToolUseId: 'spawn-research',
      },
      rootFailure,
    ],
    { sessionStatus: 'working' },
  );

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'activity', 'agent-error'],
  );
  const activity = entries[1];
  assert.equal(activity.backgroundErrorCount, 20);
  assert.equal(activity.running, true);
  assert.equal(activity.items.length, 2);
  assert.equal(activity.items[1].kind, 'agent-error');
  assert.equal(activity.items[1].occurrenceCount, 20);
  assert.equal(
    activityLabel(activity),
    '20 background failures, 1 message',
  );
  assert.equal(entries[2].id, 'root-error');
});

test('background failure groups preserve a completed turn’s final answer', () => {
  const backgroundFailures = Array.from({ length: 3 }, (_, index) => ({
    id: `complete-background-${index + 1}`,
    rowId: index + 3,
    kind: 'agent-error',
    code: 'background_action_failed',
    turnId: 'turn-complete',
    parentToolUseId: `spawn-${index + 1}`,
  }));
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-complete'),
      assistant('progress', 2, 'turn-complete'),
      ...backgroundFailures,
      assistant('final answer', 6, 'turn-complete'),
      {
        id: 'complete-result',
        rowId: 7,
        kind: 'turn-result',
        state: 'complete',
        turnId: 'turn-complete',
      },
    ],
    { sessionStatus: 'idle' },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.text || null]),
    [
      ['user', 'question'],
      ['activity', null],
      ['assistant', 'final answer'],
    ],
  );
  assert.equal(entries[1].backgroundErrorCount, 3);
  assert.equal(entries[2].importance, 'primary');
});

test('unscoped and root failures remain standalone', () => {
  const failures = [
    {
      id: 'root-background',
      kind: 'agent-error',
      code: 'background_action_failed',
      turnId: 'turn-root',
      parentToolUseId: null,
    },
    {
      id: 'unknown-turn-background',
      kind: 'agent-error',
      code: 'background_action_failed',
      turnId: null,
      parentToolUseId: 'spawn-1',
    },
    {
      id: 'nested-provider-error',
      kind: 'agent-error',
      code: 'provider_unavailable',
      turnId: 'turn-root',
      parentToolUseId: 'spawn-2',
    },
  ];

  const { entries } = buildFocusedTranscript(failures);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    failures.map((failure) => failure.id),
  );
  assert.equal(entries.every((entry) => entry.kind === 'agent-error'), true);
});

test('markerless turns remain progress even when a later turn starts', () => {
  const { entries } = buildFocusedTranscript(
    [
      user('first question', 1, 'turn-old'),
      assistant('older answer', 2, 'turn-old'),
      user('new question', 3, 'turn-new'),
      assistant('new progress', 4, 'turn-new'),
    ],
    { sessionStatus: 'working' },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.text || null]),
    [
      ['user', 'first question'],
      ['activity', null],
      ['user', 'new question'],
      ['activity', null],
    ],
  );
});

test('an idle markerless transcript uses its last root message as a fallback final', () => {
  const { entries } = buildFocusedTranscript(
    [
      user('question', 1, 'turn-idle'),
      assistant('progress', 2, 'turn-idle'),
      assistant('answer', 3, 'turn-idle'),
    ],
    { sessionStatus: 'idle' },
  );

  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.text || null]),
    [
      ['user', 'question'],
      ['activity', null],
      ['assistant', 'answer'],
    ],
  );
});

test('an orphaned failed tool result becomes a sanitized visible error', () => {
  const orphan = {
    id: 'orphan-failure',
    rowId: 4,
    kind: 'tool-failure',
    toolCallId: 'missing-call',
    title: 'Tool action failed',
    turnId: 'turn-failed',
  };
  const orphaned = buildFocusedTranscript([orphan]).entries;
  assert.deepEqual(
    orphaned.map((entry) => [entry.kind, entry.title]),
    [['agent-error', 'Tool action failed']],
  );

  const matched = buildFocusedTranscript([
    {
      id: 'tool',
      rowId: 2,
      kind: 'tool',
      toolCallId: 'present-call',
      state: 'running',
      turnId: 'turn-failed',
    },
    {
      id: 'failed-result',
      rowId: 3,
      kind: 'tool-result',
      toolCallId: 'present-call',
      state: 'failed',
      turnId: 'turn-failed',
    },
    { ...orphan, toolCallId: 'present-call' },
  ]).entries;
  assert.deepEqual(matched.map((entry) => entry.kind), ['tool']);
  assert.equal(matched[0].resolvedState, 'failed');
});

test('a nested failed result does not finish the still-working root turn', () => {
  const { entries } = buildFocusedTranscript(
    [
      assistant('root progress', 2, 'turn-research'),
      {
        id: 'nested-result',
        rowId: 3,
        kind: 'turn-result',
        state: 'failed',
        turnId: 'turn-research',
        parentToolUseId: 'spawn-research',
      },
    ],
    { sessionStatus: 'working' },
  );

  assert.equal(entries[0].kind, 'activity');
  assert.equal(entries[0].running, true);
});
