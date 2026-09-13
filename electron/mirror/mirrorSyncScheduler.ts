import { submitDesktopOperation } from '../desktopOperations.js';

import * as articleMirror from './exportArticleMirror.js';
import { syncIncrementalMirrorOutput } from './rebuildMirrorOutput.js';

const DEBOUNCE_MS = 10_000;
const MAX_WAIT_MS = 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingNodeIds = new Set<string>();
let flushInFlight: Promise<void> | null = null;

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

async function drainQueue() {
  clearTimers();
  if (flushInFlight) return flushInFlight;
  const handle = submitDesktopOperation('mirror-incremental', {
    failureLabel: '[mirror] incremental export failed',
    run: async (context) => {
      while (pendingNodeIds.size > 0) {
        const nodeIds = pendingNodeIds;
        pendingNodeIds = new Set();
        const articleIds = new Set<string>();
        for (const nodeId of nodeIds) {
          for (const articleId of articleMirror.resolveArticleIdsFromNodeId(nodeId)) articleIds.add(articleId);
        }
        if (articleIds.size > 0) await syncIncrementalMirrorOutput([...articleIds], context);
        await context.yieldIfNeeded();
      }
    }
  });
  flushInFlight = handle.promise.then(() => undefined);
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
    if (pendingNodeIds.size > 0) void drainQueue();
  }
}

function scheduleFlush() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void drainQueue();
  }, DEBOUNCE_MS);

  if (maxWaitTimer === null) {
    maxWaitTimer = setTimeout(() => {
      maxWaitTimer = null;
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      void drainQueue();
    }, MAX_WAIT_MS);
  }
}

export function scheduleMirrorSync(nodeIds: string[]) {
  for (const nodeId of nodeIds) {
    pendingNodeIds.add(nodeId);
  }

  if (pendingNodeIds.size > 0) {
    scheduleFlush();
  }
}

export async function flushMirrorSync() {
  clearTimers();
  if (pendingNodeIds.size > 0) await drainQueue();
  if (flushInFlight) await flushInFlight;
}
