import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';

import { openDatabaseConnection } from './connection.js';

export const SEARCH_INVALIDATION_IDLE_FLUSH_MS = 1000;
export const SEARCH_INVALIDATION_MAX_FLUSH_MS = 5000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
const pendingWorkspaceNodeIds = new Set<string>();

function clearFlushTimers() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (maxTimer) {
    clearTimeout(maxTimer);
    maxTimer = null;
  }
}

function scheduleFlushTimers() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(flushCoalescedWorkspaceSearchInvalidations, SEARCH_INVALIDATION_IDLE_FLUSH_MS);
  if (!maxTimer) {
    maxTimer = setTimeout(flushCoalescedWorkspaceSearchInvalidations, SEARCH_INVALIDATION_MAX_FLUSH_MS);
  }
}

export function enqueueCoalescedWorkspaceSearchInvalidation(nodeIds: string[]) {
  for (const nodeId of nodeIds) {
    const trimmedNodeId = nodeId.trim();
    if (trimmedNodeId) {
      pendingWorkspaceNodeIds.add(trimmedNodeId);
    }
  }
  if (pendingWorkspaceNodeIds.size > 0) {
    scheduleFlushTimers();
  }
}

export function flushCoalescedWorkspaceSearchInvalidations() {
  if (pendingWorkspaceNodeIds.size === 0) {
    clearFlushTimers();
    return;
  }
  const nodeIds = [...pendingWorkspaceNodeIds];
  pendingWorkspaceNodeIds.clear();
  clearFlushTimers();
  enqueueWorkspaceSearchInvalidationForNodeIds(
    openDatabaseConnection().driver,
    nodeIds,
    { advanceSourceRevision: false }
  );
}

export function resetSearchInvalidationCoalescerForTests() {
  pendingWorkspaceNodeIds.clear();
  clearFlushTimers();
}
