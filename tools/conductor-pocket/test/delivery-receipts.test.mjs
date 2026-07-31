import assert from 'node:assert/strict';
import test from 'node:test';
import {
  discardTerminalUnconfirmedDeliveries,
  receiptReachedTranscript,
  reconcileDeliveryReceipts,
} from '../public/delivery-receipts.js';

function optimistic(overrides = {}) {
  return {
    id: 'optimistic-1',
    kind: 'optimistic',
    sessionId: 'session-1',
    delivery: 'delivered',
    receiptBaselineCursor: 10,
    receiptRowId: null,
    ...overrides,
  };
}

test('a delivery receipt reconciles only after its transcript boundary arrives', () => {
  const message = optimistic();
  assert.equal(receiptReachedTranscript(message, 10), false);
  assert.equal(receiptReachedTranscript(message, 11), true);
  assert.equal(
    receiptReachedTranscript(
      optimistic({ receiptRowId: 12 }),
      11,
    ),
    false,
  );
  assert.equal(
    receiptReachedTranscript(
      optimistic({ receiptRowId: 12 }),
      12,
    ),
    true,
  );
});

test('reconciliation is receipt-based and never compares message text', () => {
  const delivered = optimistic({ id: 'delivered', text: 'same text' });
  const failed = optimistic({
    id: 'failed',
    text: 'same text',
    delivery: 'failed',
  });
  const otherSession = optimistic({
    id: 'other-session',
    sessionId: 'session-2',
  });

  const result = reconcileDeliveryReceipts(
    [delivered, failed, otherSession],
    'session-1',
    11,
  );

  assert.deepEqual(result.reconciled, [delivered]);
  assert.deepEqual(result.remaining, [failed, otherSession]);
});

test('invalid or absent receipt cursors fail closed', () => {
  for (const receipt of [
    optimistic({
      receiptBaselineCursor: null,
      receiptRowId: null,
    }),
    optimistic({ receiptBaselineCursor: -1 }),
    optimistic({ receiptBaselineCursor: 1.5 }),
    optimistic({ receiptBaselineCursor: Number.MAX_SAFE_INTEGER + 1 }),
  ]) {
    assert.equal(receiptReachedTranscript(receipt, 50), false);
  }
});

test('terminal unconfirmed bubbles are partitioned from actionable deliveries', () => {
  const explicitFailure = optimistic({
    id: 'explicit-failure',
    delivery: 'failed',
    retrySafe: false,
    errorCode: 'send_not_confirmed',
  });
  const restoredFailure = optimistic({
    id: 'restored-failure',
    sessionId: 'session-2',
    delivery: 'failed',
    errorCode: 'delivery_unknown',
  });
  const retryable = optimistic({
    id: 'retryable',
    delivery: 'failed',
    retrySafe: true,
  });
  const delivering = optimistic({
    id: 'delivering',
    delivery: 'delivering',
  });
  const confirming = optimistic({
    id: 'confirming',
    delivery: 'confirming',
  });
  const delivered = optimistic({ id: 'delivered' });
  const transcriptMessage = optimistic({
    id: 'transcript-message',
    kind: 'user',
    delivery: 'failed',
    retrySafe: false,
  });

  const input = [
    explicitFailure,
    restoredFailure,
    retryable,
    delivering,
    confirming,
    delivered,
    transcriptMessage,
  ];
  const original = [...input];
  const result = discardTerminalUnconfirmedDeliveries(input);

  assert.deepEqual(result.discarded, [
    explicitFailure,
    restoredFailure,
  ]);
  assert.deepEqual(result.remaining, [
    retryable,
    delivering,
    confirming,
    delivered,
    transcriptMessage,
  ]);
  assert.deepEqual(input, original);
});
