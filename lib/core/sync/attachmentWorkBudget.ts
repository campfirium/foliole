let priorityRevision = 0;
let waiters = 0;

/** A queued data run takes precedence at the next recoverable attachment boundary. */
export function requestAttachmentWorkYield() { priorityRevision++; }

export function waitForAttachmentWorkYield() {
  waiters++;
  requestAttachmentWorkYield();
  return () => { waiters--; };
}

export function attachmentWorkBudget(milliseconds = 2000) {
  const revision = priorityRevision;
  const deadline = performance.now() + milliseconds;
  return () => waiters > 0 || revision !== priorityRevision || performance.now() >= deadline;
}
