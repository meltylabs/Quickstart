function validCursor(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function receiptReachedTranscript(message, transcriptCursor) {
  if (message.delivery !== 'delivered' || !validCursor(transcriptCursor)) {
    return false;
  }
  if (validCursor(message.receiptRowId)) {
    return transcriptCursor >= message.receiptRowId;
  }
  if (validCursor(message.receiptBaselineCursor)) {
    return transcriptCursor > message.receiptBaselineCursor;
  }
  return false;
}

export function reconcileDeliveryReceipts(
  optimisticMessages,
  sessionId,
  transcriptCursor,
) {
  const reconciled = [];
  const remaining = optimisticMessages.filter((message) => {
    if (
      message.sessionId !== sessionId ||
      !receiptReachedTranscript(message, transcriptCursor)
    ) {
      return true;
    }
    reconciled.push(message);
    return false;
  });
  return { remaining, reconciled };
}

export function discardTerminalUnconfirmedDeliveries(
  optimisticMessages,
) {
  const discarded = [];
  const remaining = optimisticMessages.filter((message) => {
    const terminalUnconfirmed =
      message?.kind === 'optimistic' &&
      message.delivery === 'failed' &&
      message.retrySafe !== true;
    if (!terminalUnconfirmed) return true;
    discarded.push(message);
    return false;
  });
  return { remaining, discarded };
}
