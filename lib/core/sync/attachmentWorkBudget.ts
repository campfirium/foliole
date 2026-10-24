let priorityRevision = 0;
let waiters = 0;
let dataRounds = 0;
let resourceRounds = 0;
const listeners = new Set<() => void>();
const priorityListeners = new Set<() => void>();
export function onAttachmentWorkYield(listener: () => void) {
  priorityListeners.add(listener);
  return () => { priorityListeners.delete(listener); };
}

/** A queued data run takes precedence at the next recoverable attachment boundary. */
export function requestAttachmentWorkYield() {
  priorityRevision++;
  for (const listener of [...priorityListeners]) listener();
}

export function waitForAttachmentWorkYield() {
  waiters++;
  requestAttachmentWorkYield();
  return () => {
    waiters--;
    if (!waiters) for (const listener of [...listeners]) listener();
  };
}

export function hasWaitingSyncData() { return waiters > 0; }

/** Without a deadline: attachment streams continue until data work is queued or requested. */
export function attachmentDataYield() {
  const revision = priorityRevision;
  return () => hasWaitingSyncData() || revision !== priorityRevision;
}

/** True once a local change or another data run has asked bulk sync work to make way since the call. */
export function watchSyncPriorityRequests() {
  const revision = priorityRevision;
  return () => revision !== priorityRevision;
}

export function attachmentWorkBudget(milliseconds = 2000) {
  const revision = priorityRevision;
  const deadline = performance.now() + milliseconds;
  return () => hasWaitingSyncData() || revision !== priorityRevision || performance.now() >= deadline;
}


export function waitForAttachmentWorkOpportunity(signal: AbortSignal) {
  return waitUntil(() => !hasWaitingSyncData() && !dataRounds, signal);
}

export async function holdAttachmentResourceRound(signal: AbortSignal) {
  while (hasWaitingSyncData() || dataRounds) await waitForAttachmentWorkOpportunity(signal);
  signal.throwIfAborted();
  resourceRounds++;
  return () => {
    resourceRounds--;
    if (!resourceRounds) for (const listener of [...listeners]) listener();
  };
}

export function waitForAttachmentResourceRounds(signal: AbortSignal) {
  return waitUntil(() => !resourceRounds, signal);
}

function waitUntil(isReady: () => boolean, signal: AbortSignal) {
  signal.throwIfAborted();
  if (isReady()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      listeners.delete(ready);
      signal.removeEventListener('abort', cancel);
    };
    const ready = () => { if (isReady()) { cleanup(); resolve(); } };
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
