const MIN_SWIPE_DISTANCE = 72;
const MAX_SWIPE_DISTANCE = 96;
const MAX_VERTICAL_DRIFT = 56;
const MAX_SWIPE_DURATION_MS = 700;

export function isRecentChatsSwipe({
  startX,
  startY,
  endX,
  endY,
  durationMs,
  viewportWidth,
}) {
  const values = [
    startX,
    startY,
    endX,
    endY,
    durationMs,
    viewportWidth,
  ];
  if (!values.every(Number.isFinite)) return false;
  if (durationMs < 0 || durationMs > MAX_SWIPE_DURATION_MS) return false;

  const horizontal = endX - startX;
  const vertical = Math.abs(endY - startY);
  const requiredDistance = Math.max(
    MIN_SWIPE_DISTANCE,
    Math.min(MAX_SWIPE_DISTANCE, viewportWidth * 0.2),
  );
  return (
    horizontal >= requiredDistance &&
    vertical <= MAX_VERTICAL_DRIFT &&
    horizontal >= vertical * 1.5
  );
}
