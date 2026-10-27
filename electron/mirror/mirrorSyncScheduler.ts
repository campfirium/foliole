import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { submitDesktopOperation } from '../desktopOperations.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';

import * as articleMirror from './exportArticleMirror.js';
import { flushPermanentMirrorRetirements } from './mirrorPermanentDelete.js';
import { syncIncrementalMirrorOutput } from './rebuildMirrorOutput.js';

const DEBOUNCE_MS = 60_000;
let timer: ReturnType<typeof setTimeout> | null = null;
const pendingNodes = new Map<string, number>();
const pendingArticles = new Map<string, number>();
let flushInFlight: Promise<void> | null = null;

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function resolvePendingNodes() {
  for (const [nodeId, deadline] of pendingNodes) {
    for (const articleId of articleMirror.resolveArticleIdsFromNodeId(nodeId)) {
      pendingArticles.set(articleId, Math.max(deadline, pendingArticles.get(articleId) ?? 0));
    }
  }
  pendingNodes.clear();
}

function scheduleFlush() {
  clearTimer();
  if (flushInFlight) return;
  const deadlines = [...pendingNodes.values(), ...pendingArticles.values()];
  if (!deadlines.length) return;
  timer = setTimeout(() => {
    timer = null;
    void drainQueue(false).catch((error) => console.error('[mirror] incremental export failed', error));
  }, Math.max(0, Math.min(...deadlines) - Date.now()));
}

async function processPending(bypass: boolean, context: DesktopTaskContext) {
  await runWithDatabaseConnectionOwner(resolvePendingNodes);
  const candidates = [...pendingArticles.keys()];
  for (const articleId of candidates) {
    await context.yieldIfNeeded();
    const eligible = () => {
      resolvePendingNodes();
      return bypass || (pendingArticles.get(articleId) ?? Infinity) <= Date.now();
    };
    if (!await runWithDatabaseConnectionOwner(eligible)) continue;
    pendingArticles.delete(articleId);
    await syncIncrementalMirrorOutput([articleId], context, bypass ? undefined : (targetId) => {
      resolvePendingNodes();
      return !pendingArticles.has(targetId) || pendingArticles.get(targetId)! <= Date.now();
    });
  }
}

async function drainQueue(bypass: boolean) {
  clearTimer();
  if (flushInFlight) return flushInFlight;
  const handle = submitDesktopOperation('mirror-incremental', {
    failureLabel: '[mirror] incremental export failed',
    run: (context) => processPending(bypass, context)
  });
  flushInFlight = handle.promise.then(() => undefined);
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
    scheduleFlush();
  }
}

export function scheduleMirrorSync(nodeIds: string[], articleIds: string[] = [], preserveDeadline = false) {
  // Output retries already own the database and must retain the latest save deadline.
  if (preserveDeadline) resolvePendingNodes();
  const deadline = Date.now() + DEBOUNCE_MS;
  for (const articleId of articleIds) {
    if (!preserveDeadline || !pendingArticles.has(articleId)) pendingArticles.set(articleId, deadline);
  }
  for (const nodeId of nodeIds) pendingNodes.set(nodeId, deadline);
  scheduleFlush();
}

export async function flushMirrorSync() {
  clearTimer();
  if (flushInFlight) await flushInFlight;
  if (pendingNodes.size || pendingArticles.size) await drainQueue(true);
  await flushPermanentMirrorRetirements();
}
