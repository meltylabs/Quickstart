function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('request_aborted');
  error.name = 'AbortError';
  return error;
}

export async function fetchJson(
  pathname,
  {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 0,
    signal,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch_unavailable');
  }
  const controller =
    timeoutMs > 0 || signal ? new AbortController() : null;
  const forwardAbort = () => controller?.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) forwardAbort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => {
        const error = new Error('request_timeout');
        error.name = 'TimeoutError';
        controller.abort(error);
      }, timeoutMs)
    : null;

  try {
    const response = await fetchImpl(pathname, {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller?.signal,
      body,
    });
    if (controller?.signal.aborted) throw abortError(controller.signal);

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      if (controller?.signal.aborted) throw abortError(controller.signal);
    }
    if (controller?.signal.aborted) throw abortError(controller.signal);
    return { response, payload };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
