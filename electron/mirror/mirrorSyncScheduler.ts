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
const suspendedArticles = new Set<string>();
const suspendedNodes = new Set<string>();
let flushInFlight: Promise<void> | null = null;

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function resolvePendingNodes() {
  for (const [nodeId, deadline] of pendingNodes) {
    for (const articleId of articleMirror.resolveArticleIdsFromNodeId(nodeId)) {
      const wasPending = pendingArticles.has(articleId);
      pendingArticles.set(articleId, Math.max(deadline, pendingArticles.get(articleId) ?? 0));
      if (!suspendedNodes.has(nodeId)) suspendedArticles.delete(articleId);
      else if (!wasPending) suspendedArticles.add(articleId);
    }
  }
  pendingNodes.clear();
  suspendedNodes.clear();
}

function scheduleFlush() {
  clearTimer();
  if (flushInFlight) return;
  const deadlines = [
    ...[...pendingNodes].filter(([id]) => !suspendedNodes.has(id)).map(([, deadline]) => deadline),
    ...[...pendingArticles].filter(([id]) => !suspendedArticles.has(id)).map(([, deadline]) => deadline)
  ];
  if (!deadlines.length) return;
  timer = setTimeout(() => {
    timer = null;
    void drainQueue(false).catch((error) => console.error('[mirror] incremental export failed', error));
  }, Math.max(0, Math.min(...deadlines) - Date.now()));
}

async function processPending(bypass: boolean, context: DesktopTaskContext, attempted: Map<string, number>) {
  await runWithDatabaseConnectionOwner(resolvePendingNodes);
  for (const [id, deadline] of pendingArticles) attempted.set(id, deadline);
  const candidates = [...attempted.keys()];
  for (const articleId of candidates) {
    await context.yieldIfNeeded();
    const eligible = () => {
      resolvePendingNodes();
      return bypass || (!suspendedArticles.has(articleId) && (pendingArticles.get(articleId) ?? Infinity) <= Date.now());
    };
    if (!await runWithDatabaseConnectionOwner(eligible)) continue;
    const deadline = pendingArticles.get(articleId)!;
    pendingArticles.delete(articleId);
    suspendedArticles.delete(articleId);
    try {
      await syncIncrementalMirrorOutput([articleId], context, bypass ? undefined : (targetId) => {
        resolvePendingNodes();
        return !pendingArticles.has(targetId) || pendingArticles.get(targetId)! <= Date.now();
      });
    } catch (error) {
      await runWithDatabaseConnectionOwner(() => {
        resolvePendingNodes();
        if (!pendingArticles.has(articleId)) {
          pendingArticles.set(articleId, deadline);
          suspendedArticles.add(articleId);
        }
      });
      throw error;
    }
  }
}

async function drainQueue(bypass: boolean, forQuit = false) {
  clearTimer();
  if (flushInFlight) return flushInFlight;
  let completed = false;
  const attemptedNodes = new Map(pendingNodes);
  const attemptedArticles = new Map(pendingArticles);
  const handle = submitDesktopOperation('mirror-incremental', {
    failureLabel: '[mirror] incremental export failed',
    // Quit must run its callback after startup recovery, rather than coalesce into its handle.
    ...(forQuit ? { concurrencyKey: 'mirror-quit' } : {}),
    run: async (context) => {
      await processPending(bypass, context, attemptedArticles);
      completed = !context.signal.aborted;
    }
  });
  flushInFlight = handle.promise.then(() => undefined);
  try {
    await flushInFlight;
    return completed;
  } finally {
    if (!completed) {
      // Failed/cancelled work stays available to an explicit flush, without a retry timer.
      for (const [id, deadline] of attemptedNodes) if (pendingNodes.get(id) === deadline) suspendedNodes.add(id);
      for (const [id, deadline] of attemptedArticles) if (pendingArticles.get(id) === deadline) suspendedArticles.add(id);
    }
    flushInFlight = null;
    scheduleFlush();
  }
}

export function scheduleMirrorSync(nodeIds: string[], articleIds: string[] = [], preserveDeadline = false) {
  // Output retries already own the database and must retain the latest save deadline.
  if (preserveDeadline) resolvePendingNodes();
  const deadline = Date.now() + DEBOUNCE_MS;
  for (const articleId of articleIds) {
    if (!preserveDeadline || !pendingArticles.has(articleId)) {
      pendingArticles.set(articleId, deadline);
      suspendedArticles.delete(articleId);
    }
  }
  for (const nodeId of nodeIds) {
    pendingNodes.set(nodeId, deadline);
    suspendedNodes.delete(nodeId);
  }
  scheduleFlush();
}

export async function flushMirrorSync(options: { forQuit?: boolean } = {}) {
  clearTimer();
  if (flushInFlight) {
    try {
      await flushInFlight;
    } catch (error) {
      if (!options.forQuit) throw error;
      // Quit can consume retained demand after an earlier automatic attempt failed.
      console.error('[mirror] preceding export failed before quit flush', error);
    }
  }
  do {
    if (pendingNodes.size || pendingArticles.size) {
      const completed = await drainQueue(true, options.forQuit);
      if (options.forQuit && completed === false) throw new DOMException('Mirror quit flush cancelled', 'AbortError');
    }
    await flushPermanentMirrorRetirements();
    // Only quit drains saves received while rendering; ordinary flush stays one-shot.
  } while (options.forQuit && (pendingNodes.size || pendingArticles.size));
}
