let priorityRevision = 0;
let waiters = 0;
let dataRounds = 0;
const listeners = new Set<() => void>();

/** A queued data run takes precedence at the next recoverable attachment boundary. */
export function requestAttachmentWorkYield() { priorityRevision++; }

export function waitForAttachmentWorkYield() {
  waiters++;
  requestAttachmentWorkYield();
  return () => {
    waiters--;
    if (!waiters) for (const listener of [...listeners]) listener();
  };
}

export function hasWaitingSyncData() { return waiters > 0; }

export function attachmentWorkBudget(milliseconds = 2000) {
  const revision = priorityRevision;
  const deadline = performance.now() + milliseconds;
  return () => hasWaitingSyncData() || revision !== priorityRevision || performance.now() >= deadline;
}


export function waitForAttachmentWorkOpportunity(signal: AbortSignal) {
  signal.throwIfAborted();
  if (!hasWaitingSyncData() && !dataRounds) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      listeners.delete(ready);
      signal.removeEventListener('abort', cancel);
    };
    const ready = () => { if (!hasWaitingSyncData() && !dataRounds) { cleanup(); resolve(); } };
    const cancel = () => { cleanup(); reject(signal.reason); };
    listeners.add(ready);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else ready();
  });
}


export function holdSyncDataRound() {
  dataRounds++;
  requestAttachmentWorkYield();
  return () => {
    dataRounds--;
    if (!dataRounds) for (const listener of [...listeners]) listener();
  };
}
