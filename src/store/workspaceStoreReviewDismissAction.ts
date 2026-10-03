import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { buildReadingReviewDomainPatch } from './workspaceReadingReviewDomain';
import {
  persistAndApplyReadingReviewPatch,
  persistReadingReviewNodes,
  type ReadingReviewPendingNodeIds
} from './workspaceReadingReviewHistoryCommit';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { buildNextDismissReviewSession } from './workspaceReviewDismissSession';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import type { WorkspaceState } from './workspaceStore';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';
import type { WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

interface DismissReviewPatchResult {
  historyEntry: WorkspaceTopicDismissHistoryEntry;
  nextNodesForSync: WorkspaceState['nodesById'][string][];
  patch: Partial<WorkspaceState>;
}

function buildDismissReviewPatch(args: {
  currentNodeId: string;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}): DismissReviewPatchResult | null {
  const result = buildReadingReviewDomainPatch({
    action: 'dismiss',
    currentNodeId: args.currentNodeId,
    now: args.now,
    snapshot: args.snapshot,
    state: args.state
  });
  if (!result) return null;
  const { nextNodeId, nextReviewSession } = buildNextDismissReviewSession({ ...args, nextNodesById: result.nextNodesById });
  const activeContext = buildReviewActiveNodeContext(
    args.state,
    nextNodeId ?? nextReviewSession.continueNodeId ?? null
  );
  return {
    historyEntry: createReadingReviewHistoryEntry({
      afterActiveNodeId: activeContext.activeNodeId,
      ...('browseRootNodeId' in activeContext
        ? { afterBrowseRootNodeId: activeContext.browseRootNodeId }
        : {}),
      afterReading: result.afterReading,
      afterReviewSession: nextReviewSession,
      beforeReading: result.beforeReading,
      beforeReviewSession: args.snapshot.reviewSession,
      mutationTimestamp: args.now,
      nodeId: args.currentNodeId,
      ...(result.sequentialChanges.length ? { relatedReadings: result.sequentialChanges } : {}),
      state: args.state,
      title: 'Dismiss Topic'
    }),
    nextNodesForSync: result.nextNodesForSync,
    patch: {
      ...activeContext,
      nodesById: result.nextNodesById,
      reviewSession: nextReviewSession
    }
  };
}

export function createDismissReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet) {
  return createDismissReviewTopicActionWithPending(set, get, new Set());
}

export function createDismissReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds,
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
) {
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    const result = buildDismissReviewPatch({
      currentNodeId,
      now,
      snapshot,
      state: get()
    });
    if (!result) return false;
    const committed = await persistAndApplyReadingReviewPatch({
      buildPatch: () => result,
      currentNodeId,
      get,
      pendingNodeIds,
      persistence,
      set
    });
    return Boolean(committed);
  };
}

export function createLegacyDismissReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet) {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    let nextNodesForSync: WorkspaceState['nodesById'][string][] = [];
    set((state) => {
      const result = buildDismissReviewPatch({
        currentNodeId,
        now,
        snapshot,
        state
      });
      if (!result) return state;
      nextNodesForSync = result.nextNodesForSync;
      return result.patch;
    });
    void persistReadingReviewNodes(nextNodesForSync);
    return true;
  };
}
