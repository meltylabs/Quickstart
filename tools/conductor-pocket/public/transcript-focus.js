const ACTIVITY_KINDS = new Set(['assistant', 'tool']);
const HIDDEN_KINDS = new Set(['status', 'tool-result', 'turn-result']);

function isRootMessage(message) {
  return !message.parentToolUseId;
}

function isBackgroundFailure(message) {
  return (
    message.kind === 'agent-error' &&
    message.code === 'background_action_failed' &&
    Boolean(message.parentToolUseId)
  );
}

function numericRowId(message) {
  const value = Number(message.rowId);
  return Number.isFinite(value) ? value : 0;
}

function completedTurns(messages, sessionStatus) {
  const turns = new Map();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message.turnId) continue;
    if (!turns.has(message.turnId)) {
      turns.set(message.turnId, {
        assistants: [],
        result: null,
        firstIndex: index,
      });
    }
    const turn = turns.get(message.turnId);
    if (message.kind === 'assistant' && isRootMessage(message)) {
      turn.assistants.push(message);
    } else if (message.kind === 'turn-result' && isRootMessage(message)) {
      turn.result = message;
    }
  }

  const orderedTurns = [...turns.entries()].sort(
    (left, right) => left[1].firstIndex - right[1].firstIndex,
  );
  const finalRows = new Map();

  for (const [turnId, turn] of orderedTurns) {
    if (turn.result?.state === 'failed') continue;
    if (!turn.result && sessionStatus !== 'idle') continue;
    let candidates = turn.assistants;
    if (turn.result) {
      const resultRowId = numericRowId(turn.result);
      candidates = candidates.filter(
        (message) => numericRowId(message) < resultRowId,
      );
    }
    if (candidates.length === 0) continue;
    finalRows.set(
      turnId,
      Math.max(...candidates.map((message) => numericRowId(message))),
    );
  }

  return finalRows;
}

function activeTurnId(messages, sessionStatus) {
  if (sessionStatus !== 'working') return null;
  const terminalTurns = new Set(
    messages
      .filter(
        (message) =>
          message.kind === 'turn-result' &&
          message.turnId &&
          isRootMessage(message),
      )
      .map((message) => message.turnId),
  );
  return [...messages]
    .reverse()
    .find(
      (message) =>
        ACTIVITY_KINDS.has(message.kind) &&
        message.turnId &&
        isRootMessage(message) &&
        !terminalTurns.has(message.turnId),
    )?.turnId || null;
}

function resolvedToolState(message, toolResults) {
  return toolResults.get(message.toolCallId)?.state || message.state || 'running';
}

function repeatedFailedBashTurns(messages, toolResults) {
  const toolCallIdsByTurn = new Map();
  for (const message of messages) {
    if (
      message.kind !== 'tool' ||
      message.name !== 'Bash' ||
      !message.turnId ||
      !message.toolCallId ||
      !isRootMessage(message) ||
      toolResults.get(message.toolCallId)?.state !== 'failed'
    ) {
      continue;
    }
    if (!toolCallIdsByTurn.has(message.turnId)) {
      toolCallIdsByTurn.set(message.turnId, new Set());
    }
    toolCallIdsByTurn.get(message.turnId).add(message.toolCallId);
  }
  return new Set(
    [...toolCallIdsByTurn.entries()]
      .filter(([, toolCallIds]) => toolCallIds.size > 1)
      .map(([turnId]) => turnId),
  );
}

function activityEntry(turnId, firstMessage) {
  return {
    id: `activity:${turnId}:${firstMessage.id}`,
    kind: 'activity',
    turnId,
    items: [],
    messageCount: 0,
    toolCount: 0,
    failedToolCount: 0,
    failedToolNames: [],
    backgroundErrorCount: 0,
    running: false,
  };
}

/**
 * Mirrors Conductor's focused transcript hierarchy:
 * completed turns keep their final root answer prominent while intermediate
 * root prose and successful tool calls become a compact disclosure.
 */
export function buildFocusedTranscript(
  messages,
  { sessionStatus = 'unknown' } = {},
) {
  const toolResults = new Map(
    messages
      .filter((message) => message.kind === 'tool-result' && message.toolCallId)
      .map((message) => [message.toolCallId, message]),
  );
  const toolCallIds = new Set(
    messages
      .filter((message) => message.kind === 'tool' && message.toolCallId)
      .map((message) => message.toolCallId),
  );
  const backgroundFailuresByTurn = new Map();
  for (const message of messages) {
    if (!message.turnId || !isBackgroundFailure(message)) continue;
    const existing = backgroundFailuresByTurn.get(message.turnId);
    if (existing) {
      if (existing.ids.has(message.id)) continue;
      existing.ids.add(message.id);
      existing.count += 1;
    } else {
      backgroundFailuresByTurn.set(message.turnId, {
        count: 1,
        ids: new Set([message.id]),
        representative: message,
      });
    }
  }
  const finalRows = completedTurns(messages, sessionStatus);
  const activeTurn = activeTurnId(messages, sessionStatus);
  const compactBashFailureTurns = repeatedFailedBashTurns(messages, toolResults);
  const entries = [];
  const emittedBackgroundFailureTurns = new Set();
  const emittedCompactBashToolCalls = new Set();
  let activity = null;

  const flushActivity = () => {
    if (!activity) return;
    entries.push(activity);
    activity = null;
  };

  const appendActivity = (message) => {
    if (!activity || activity.turnId !== message.turnId) {
      flushActivity();
      activity = activityEntry(message.turnId, message);
    }
    const previousItem = activity.items.at(-1);
    if (
      message.compactFailure === true &&
      previousItem?.compactFailure === true &&
      previousItem.name === message.name
    ) {
      previousItem.occurrenceCount =
        (Number(previousItem.occurrenceCount) || 1) + 1;
    } else {
      activity.items.push(message);
    }
    if (message.kind === 'assistant') activity.messageCount += 1;
    if (message.kind === 'tool') {
      activity.toolCount += 1;
      const state = resolvedToolState(message, toolResults);
      if (message.compactFailure === true && state === 'failed') {
        activity.failedToolCount += 1;
        if (!activity.failedToolNames.includes(message.name)) {
          activity.failedToolNames.push(message.name);
        }
      } else if (state === 'running') {
        activity.running = true;
      }
    }
  };

  for (const message of messages) {
    if (HIDDEN_KINDS.has(message.kind)) continue;

    if (
      message.kind === 'assistant' &&
      message.turnId &&
      isRootMessage(message)
    ) {
      const finalRow = finalRows.get(message.turnId);
      if (finalRow != null && numericRowId(message) === finalRow) {
        flushActivity();
        entries.push({ ...message, importance: 'primary' });
      } else {
        appendActivity({ ...message, importance: 'progress' });
      }
      continue;
    }

    if (message.kind === 'tool' && message.turnId && isRootMessage(message)) {
      const state = resolvedToolState(message, toolResults);
      if (state === 'failed') {
        if (
          message.name === 'Bash' &&
          compactBashFailureTurns.has(message.turnId)
        ) {
          if (emittedCompactBashToolCalls.has(message.toolCallId)) continue;
          emittedCompactBashToolCalls.add(message.toolCallId);
          appendActivity({
            ...message,
            resolvedState: state,
            compactFailure: true,
            occurrenceCount: 1,
          });
        } else {
          flushActivity();
          entries.push({ ...message, resolvedState: state });
        }
      } else {
        appendActivity({ ...message, resolvedState: state });
      }
      continue;
    }

    if (isBackgroundFailure(message) && message.turnId) {
      if (emittedBackgroundFailureTurns.has(message.turnId)) continue;
      const group = backgroundFailuresByTurn.get(message.turnId);
      if (!group) continue;
      if (!activity || activity.turnId !== message.turnId) {
        flushActivity();
        activity = activityEntry(message.turnId, message);
      }
      activity.backgroundErrorCount = group.count;
      activity.items.push({
        ...group.representative,
        occurrenceCount: group.count,
      });
      emittedBackgroundFailureTurns.add(message.turnId);
      continue;
    }

    if (message.kind === 'tool-failure') {
      if (message.toolCallId && toolCallIds.has(message.toolCallId)) continue;
      flushActivity();
      entries.push({ ...message, kind: 'agent-error' });
      continue;
    }

    if (message.kind === 'assistant' && !isRootMessage(message)) {
      continue;
    }

    if (ACTIVITY_KINDS.has(message.kind) && message.turnId) {
      appendActivity(message);
      continue;
    }

    flushActivity();
    entries.push(message);
  }

  flushActivity();
  if (activeTurn) {
    const activeEntry = [...entries]
      .reverse()
      .find(
        (entry) =>
          entry.kind === 'activity' && entry.turnId === activeTurn,
      );
    if (activeEntry) activeEntry.running = true;
  }
  return { entries, toolResults };
}

function countPhrase(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function activityLabel(activity) {
  const parts = [];
  if (activity.failedToolCount > 0) {
    const failedToolNames = Array.isArray(activity.failedToolNames)
      ? activity.failedToolNames.filter(Boolean)
      : [];
    if (failedToolNames.length === 1) {
      parts.push(
        countPhrase(
          activity.failedToolCount,
          `${failedToolNames[0]} failure`,
          `${failedToolNames[0]} failures`,
        ),
      );
    } else {
      parts.push(
        countPhrase(
          activity.failedToolCount,
          'failed action',
          'failed actions',
        ),
      );
    }
  }
  if (activity.backgroundErrorCount > 0) {
    parts.push(
      countPhrase(
        activity.backgroundErrorCount,
        'background failure',
        'background failures',
      ),
    );
  }
  const remainingToolCount =
    activity.toolCount - (Number(activity.failedToolCount) || 0);
  if (remainingToolCount > 0) {
    parts.push(
      countPhrase(remainingToolCount, 'tool call', 'tool calls'),
    );
  }
  if (activity.messageCount > 0) {
    parts.push(countPhrase(activity.messageCount, 'message', 'messages'));
  }
  return parts.join(', ') || 'Activity';
}
