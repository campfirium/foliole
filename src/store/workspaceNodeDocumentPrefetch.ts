import {
  getVisibleWorkspaceNodeDocumentPrefetchNodeIds,
  listWorkspaceNodeDocumentPrefetchCandidates,
  readCachedWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentCacheForTest,
  setVisibleWorkspaceNodeDocumentPrefetchNodeIds
} from './workspaceNodeDocumentCache';
import {
  hasPendingNodeDocumentLoad,
  loadWorkspaceNodeDocument,
  resetWorkspaceNodeDocumentLoaderForTest,
  shouldSkipNodeDocumentPreparation
} from './workspaceNodeDocumentLoader';
import { useWorkspaceStore } from './workspaceStore';

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
      await loadWorkspaceNodeDocument(nodeId, {});
      break;
    }
  } finally {
    isNodeDocumentPrefetchRunning = false;
    if (queuedNodeDocumentPrefetchIds.length > 0) {
      scheduleNodeDocumentPrefetchRun();
    }
  }
}

export function setVisibleWorkspaceNodeDocumentPrefetchIds(nodeIds: string[]) {
  setVisibleWorkspaceNodeDocumentPrefetchNodeIds(nodeIds);
}

export function requestWorkspaceNodeDocumentPreload() {
  const state = useWorkspaceStore.getState();
  const nextNodeIds = listWorkspaceNodeDocumentPrefetchCandidates({
    activeNodeId: state.activeNodeId,
    navigationBackStack: state.navigation.backStack,
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    visibleNodeIds: getVisibleWorkspaceNodeDocumentPrefetchNodeIds()
  });

  for (const nodeId of nextNodeIds) {
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
