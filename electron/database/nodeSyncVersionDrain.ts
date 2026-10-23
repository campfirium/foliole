import type { DesktopTaskPriority } from '../desktopTaskTypes.js';

import { runDesktopDatabaseWrite } from './desktopDatabaseWriteQueue.js';
import { backfillMissingDesktopNodeSyncState, flushDirtyNodeSyncVersionBatch } from './nodeSyncVersions.js';

const BATCH_SIZE = 50;

let running: Promise<string[]> | null = null;
let queued: { priority: DesktopTaskPriority; promise: Promise<string[]> } | null = null;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Writes the versions of every dirty node batch by batch, releasing the database and the event loop
 * between batches. A call made while a drain runs waits for one more full pass, so nodes it dirtied
 * are always covered.
 */
export function drainDirtyNodeSyncVersions(priority: DesktopTaskPriority = 'background'): Promise<string[]> {
  if (!running) return start(priority);
  if (queued) {
    if (priority === 'foreground') queued.priority = 'foreground';
    return queued.promise;
  }
  const next: { priority: DesktopTaskPriority; promise: Promise<string[]> } = { priority, promise: Promise.resolve([]) };
  next.promise = running.catch(() => []).then(() => {
    queued = null;
    return start(next.priority);
  });
  queued = next;
  return next.promise;
}

/** Starts a background drain without waiting for it. */
export function scheduleNodeSyncVersionDrain() {
  void drainDirtyNodeSyncVersions().catch((error) => {
    console.error('[sync] pending node version drain failed', error);
  });
}

function start(priority: DesktopTaskPriority) {
  const drain = runDrain(() => queued?.priority === 'foreground' ? 'foreground' : priority);
  running = drain;
  void drain.catch(() => undefined).finally(() => {
    if (running === drain) running = null;
  });
  return drain;
}

async function runDrain(priority: () => DesktopTaskPriority) {
  const flushed = new Set<string>();
  for (;;) {
    const batch = await runDesktopDatabaseWrite(priority(), () => flushDirtyNodeSyncVersionBatch(BATCH_SIZE));
    for (const nodeId of batch) flushed.add(nodeId);
    if (batch.length < BATCH_SIZE) break;
    await yieldToEventLoop();
  }
  for (const nodeId of await runDesktopDatabaseWrite(priority(), backfillMissingDesktopNodeSyncState)) {
    flushed.add(nodeId);
  }
  return [...flushed];
}
