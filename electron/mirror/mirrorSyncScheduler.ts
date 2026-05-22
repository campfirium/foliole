import { resolveArticleIdFromNodeId } from './exportArticleMirror.js';
import { syncIncrementalMirrorOutput } from './rebuildMirrorOutput.js';

const DEBOUNCE_MS = 10_000;
const MAX_WAIT_MS = 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingArticleIds = new Set<string>();
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
  const articleIds = pendingArticleIds;
  pendingArticleIds = new Set();
  clearTimers();

  if (articleIds.size === 0) {
    return;
  }

  try {
    await syncIncrementalMirrorOutput([...articleIds]);
  } catch (error) {
    console.error('[mirror] incremental export failed', {
      articleIds: [...articleIds],
      error
    });
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
    const articleId = resolveArticleIdFromNodeId(nodeId);
    if (articleId) {
      pendingArticleIds.add(articleId);
    }
  }

  if (pendingArticleIds.size > 0) {
    scheduleFlush();
  }
}

export async function flushMirrorSync() {
  clearTimers();
  if (pendingArticleIds.size === 0) {
    if (flushInFlight) {
      await flushInFlight;
    }
    return;
  }
  flushInFlight = drainQueue();
  await flushInFlight;
  flushInFlight = null;
}
