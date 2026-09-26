import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';

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
  idleTimer = setTimeout(flushFromTimer, SEARCH_INVALIDATION_IDLE_FLUSH_MS);
  if (!maxTimer) {
    maxTimer = setTimeout(flushFromTimer, SEARCH_INVALIDATION_MAX_FLUSH_MS);
  }
}

function flushFromTimer() {
  void flushCoalescedWorkspaceSearchInvalidations().catch((error) => {
    appendMainProcessDiagnosticLog('search_index_invalidation_flush_failed', { error });
  });
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

export async function flushCoalescedWorkspaceSearchInvalidations() {
  clearFlushTimers();
  await runWithDatabaseConnectionOwner(() => {
    if (pendingWorkspaceNodeIds.size === 0) return;
    const nodeIds = [...pendingWorkspaceNodeIds];
    enqueueWorkspaceSearchInvalidationForNodeIds(
      openDatabaseConnection().driver,
      nodeIds,
      { advanceSourceRevision: false }
    );
    nodeIds.forEach((nodeId) => pendingWorkspaceNodeIds.delete(nodeId));
  });
}

export function resetSearchInvalidationCoalescerForTests() {
  pendingWorkspaceNodeIds.clear();
  clearFlushTimers();
}
