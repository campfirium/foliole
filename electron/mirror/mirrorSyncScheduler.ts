import { syncIncrementalMirrorOutput } from './mirrorOutputSync.js';

const DEBOUNCE_MS = 1000;
const MAX_WAIT_MS = 30_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNodeIds = new Set<string>();
let syncInFlight = false;
let rerunRequested = false;

function clearTimers() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (maxWaitTimer !== null) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }
}

async function runSync() {
  if (syncInFlight) {
    rerunRequested = true;
    return;
  }

  const nodeIds = pendingNodeIds;
  pendingNodeIds = new Set();
  clearTimers();
  syncInFlight = true;

  try {
    await syncIncrementalMirrorOutput(nodeIds.size > 0 ? nodeIds : null);
  } catch (error) {
    console.error('[mirror] scheduled sync failed', error);
  } finally {
    syncInFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void runSync();
    }
  }
}

export function scheduleMirrorSync(nodeIds: string[]) {
  for (const id of nodeIds) {
    pendingNodeIds.add(id);
  }

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSync();
  }, DEBOUNCE_MS);

  if (maxWaitTimer === null) {
    maxWaitTimer = setTimeout(() => {
      maxWaitTimer = null;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void runSync();
    }, MAX_WAIT_MS);
  }
}

export async function flushMirrorSync() {
  clearTimers();
  if (pendingNodeIds.size > 0 || syncInFlight) {
    if (syncInFlight) {
      rerunRequested = true;
      // Wait for the in-flight sync to complete and its rerun
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!syncInFlight && !rerunRequested) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
    } else {
      await runSync();
    }
  }
}
