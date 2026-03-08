type QueueState = {
  inFlight: Set<string>;
  lastRunAt: Map<string, number>;
  rateLimitedUntil: Map<string, number>;
};

const globalState = globalThis as unknown as {
  __meta_sync_queue_state__?: QueueState;
};

function getState(): QueueState {
  if (!globalState.__meta_sync_queue_state__) {
    globalState.__meta_sync_queue_state__ = {
      inFlight: new Set<string>(),
      lastRunAt: new Map<string, number>(),
      rateLimitedUntil: new Map<string, number>(),
    };
  }
  return globalState.__meta_sync_queue_state__;
}

export function isMetaCallBlocked(storeId: string): boolean {
  const state = getState();
  const until = state.rateLimitedUntil.get(storeId) || 0;
  return Date.now() < until;
}

export function markMetaRateLimited(storeId: string, retryAfterSeconds = 60): void {
  const state = getState();
  const until = Date.now() + Math.max(1, retryAfterSeconds) * 1000;
  state.rateLimitedUntil.set(storeId, until);
}

export function enqueueMetaSyncTask(
  taskKey: string,
  minIntervalMs: number,
  task: () => Promise<void>
): boolean {
  const state = getState();
  const now = Date.now();
  const lastRun = state.lastRunAt.get(taskKey) || 0;

  if (state.inFlight.has(taskKey)) return false;
  if (now - lastRun < minIntervalMs) return false;

  state.inFlight.add(taskKey);
  state.lastRunAt.set(taskKey, now);

  void task()
    .catch(() => {
      // Best effort background sync.
    })
    .finally(() => {
      state.inFlight.delete(taskKey);
    });

  return true;
}
