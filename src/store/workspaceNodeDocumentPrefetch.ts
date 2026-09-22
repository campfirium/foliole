import {
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest
} from './workspaceNodeDocumentCache';
import {
  hasPendingNodeDocumentLoad,
  loadWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentLoaderForTest,
  shouldSkipNodeDocumentPreparation
} from './workspaceNodeDocumentLoader';

const MAX_QUEUED_NODE_DOCUMENT_PREFETCHES = 2;
const queuedNodeDocumentPrefetchIds: string[] = [];

let queuedNodeDocumentPrefetchIdSet = new Set<string>();
let isNodeDocumentPrefetchRunning = false;
let nodeDocumentPrefetchTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNodeDocumentPrefetchRun() {
  if (isNodeDocumentPrefetchRunning || nodeDocumentPrefetchTimer !== null) {
    return;
  }
  nodeDocumentPrefetchTimer = globalThis.setTimeout(() => {
    nodeDocumentPrefetchTimer = null;
    void runQueuedNodeDocumentPrefetch();
  }, 16);
}

async function runQueuedNodeDocumentPrefetch() {
  if (isNodeDocumentPrefetchRunning) {
    return;
  }
  isNodeDocumentPrefetchRunning = true;

  try {
    while (queuedNodeDocumentPrefetchIds.length > 0) {
      const nodeId = queuedNodeDocumentPrefetchIds.shift();
      if (!nodeId) {
        continue;
      }
      queuedNodeDocumentPrefetchIdSet.delete(nodeId);
      if (shouldSkipNodeDocumentPreparation(nodeId) || readCachedWorkspaceNodeDocument(nodeId)) {
        continue;
      }
      await loadWorkspaceNodeDocument(nodeId, {}).catch(() => null);
      break;
    }
  } finally {
    isNodeDocumentPrefetchRunning = false;
    if (queuedNodeDocumentPrefetchIds.length > 0) {
      scheduleNodeDocumentPrefetchRun();
    }
  }
}

export function requestWorkspaceNodeDocumentPreload(nodeIds: readonly string[]) {
  for (const nodeId of new Set(nodeIds.filter(Boolean))) {
    if (
      queuedNodeDocumentPrefetchIdSet.has(nodeId) ||
      hasPendingNodeDocumentLoad(nodeId) ||
      shouldSkipNodeDocumentPreparation(nodeId) ||
      readCachedWorkspaceNodeDocument(nodeId)
    ) {
      continue;
    }
    queuedNodeDocumentPrefetchIds.push(nodeId);
    queuedNodeDocumentPrefetchIdSet.add(nodeId);
  }

  while (queuedNodeDocumentPrefetchIds.length > MAX_QUEUED_NODE_DOCUMENT_PREFETCHES) {
    const retiredNodeId = queuedNodeDocumentPrefetchIds.shift();
    if (retiredNodeId) {
      queuedNodeDocumentPrefetchIdSet.delete(retiredNodeId);
    }
  }

  if (queuedNodeDocumentPrefetchIds.length > 0) {
    scheduleNodeDocumentPrefetchRun();
  }
}

export function resetWorkspaceNodeDocumentPrefetchForTest() {
  queuedNodeDocumentPrefetchIds.length = 0;
  queuedNodeDocumentPrefetchIdSet = new Set<string>();
  if (nodeDocumentPrefetchTimer !== null) {
    globalThis.clearTimeout(nodeDocumentPrefetchTimer);
    nodeDocumentPrefetchTimer = null;
  }
  isNodeDocumentPrefetchRunning = false;
  resetWorkspaceNodeDocumentLoaderForTest();
  resetWorkspaceNodeDocumentCacheForTest();
}
