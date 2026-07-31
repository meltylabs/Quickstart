import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecentChatsSwipe,
} from '../public/swipe-navigation.js';

function gesture(overrides = {}) {
  return {
    startX: 80,
    startY: 400,
    endX: 190,
    endY: 410,
    durationMs: 280,
    viewportWidth: 390,
    ...overrides,
  };
}

test('a deliberate right swipe opens recent chats', () => {
  assert.equal(isRecentChatsSwipe(gesture()), true);
});

test('vertical, leftward, short, and slow gestures stay reading gestures', () => {
  assert.equal(
    isRecentChatsSwipe(gesture({ endX: 105 })),
    false,
  );
  assert.equal(
    isRecentChatsSwipe(gesture({ endX: 20 })),
    false,
  );
  assert.equal(
    isRecentChatsSwipe(gesture({ endY: 500 })),
    false,
  );
  assert.equal(
    isRecentChatsSwipe(gesture({ durationMs: 900 })),
    false,
  );
});

test('invalid gesture measurements fail closed', () => {
  assert.equal(
    isRecentChatsSwipe(gesture({ endX: Number.NaN })),
    false,
  );
  assert.equal(
    isRecentChatsSwipe(gesture({ viewportWidth: undefined })),
    false,
  );
});
