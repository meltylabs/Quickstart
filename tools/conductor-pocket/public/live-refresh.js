export function createLiveRefreshCoordinator({
  delayMs,
  run,
  onError = () => {},
}) {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new TypeError('invalid_refresh_delay');
  }
  if (typeof run !== 'function' || typeof onError !== 'function') {
    throw new TypeError('invalid_refresh_handler');
  }

  let timer = null;
  let inFlight = null;
  let controller = null;
  let queued = false;
  let generation = 0;

  function schedule() {
    queued = true;
    if (timer !== null || inFlight) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  }

  async function drain() {
    if (inFlight) return inFlight;
    queued = false;
    const runGeneration = generation;
    const runController = new AbortController();
    controller = runController;
    const operation = Promise.resolve().then(() =>
      run({
        signal: runController.signal,
        generation: runGeneration,
      }),
    );
    inFlight = operation;
    try {
      await operation;
    } catch (error) {
      if (!runController.signal.aborted) onError(error);
    } finally {
      if (
        runGeneration !== generation ||
        inFlight !== operation
      ) {
        return;
      }
      inFlight = null;
      controller = null;
      if (queued) schedule();
    }
  }

  function stop() {
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    queued = false;
    controller?.abort();
    controller = null;
    inFlight = null;
  }

  return {
    schedule,
    stop,
    flush: drain,
  };
}

export function createSessionMessageRequestCoordinator() {
  const activeBySession = new Map();
  const generationBySession = new Map();

  async function run({
    sessionId,
    full = false,
    signal,
    load,
    commit,
  }) {
    if (
      typeof sessionId !== 'string' ||
      sessionId.length === 0 ||
      typeof load !== 'function' ||
      typeof commit !== 'function'
    ) {
      throw new TypeError('invalid_session_message_request');
    }

    const active = activeBySession.get(sessionId);
    if (active && !active.signal?.aborted) {
      if (active.full === full || (active.full && !full)) {
        return active.promise;
      }
      // A full baseline supersedes an incremental request. Its generation
      // prevents the older response from committing if it resolves later.
    }

    const generation = (generationBySession.get(sessionId) || 0) + 1;
    generationBySession.set(sessionId, generation);
    const operation = (async () => {
      const result = await load();
      if (
        signal?.aborted ||
        generationBySession.get(sessionId) !== generation
      ) {
        return undefined;
      }
      return commit(result);
    })();
    const record = {
      full,
      signal,
      promise: operation,
    };
    activeBySession.set(sessionId, record);

    try {
      return await operation;
    } finally {
      if (activeBySession.get(sessionId) === record) {
        activeBySession.delete(sessionId);
      }
    }
  }

  function reset() {
    activeBySession.clear();
    for (const [sessionId, generation] of generationBySession) {
      generationBySession.set(sessionId, generation + 1);
    }
  }

  return {
    run,
    reset,
  };
}
