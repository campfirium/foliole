import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import { buildReadingReviewDomainPatch } from './workspaceReadingReviewDomain';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import {
  advanceReviewSession,
  completeReviewSession
} from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  persistReadingReviewNodes,
  type ReadingReviewPendingNodeIds
} from './workspaceStoreReadingReviewActions';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

interface DismissReviewPatchResult {
  nextNodesForSync: WorkspaceState['nodesById'][string][];
  patch: Partial<WorkspaceState>;
}

function buildNextDismissReviewSession(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const soonNodeIds = (args.snapshot.reviewSession.soonNodeIds ?? []).filter((nodeId) => nodeId !== args.currentNodeId);
  const remainingQueueNodeIds = args.snapshot.reviewSession.queueNodeIds.filter((nodeId) =>
    nodeId !== args.currentNodeId &&
    !soonNodeIds.includes(nodeId) &&
    Boolean(args.nextNodesById[nodeId]) &&
    !args.state.trashedNodeIds.includes(nodeId)
  );
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    excludedNodeIds: [args.currentNodeId, ...soonNodeIds],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = remainingQueueNodeIds[0] ?? nextQueue.currentNodeId ?? soonNodeIds[0] ?? null;
  const nextSoonNodeIds = remainingQueueNodeIds.length > 0 || nextQueue.currentNodeId ? soonNodeIds : soonNodeIds.slice(1);
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  const readingElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const readTopicDelta = args.snapshot.reviewSession.queueNodeIds.includes(args.currentNodeId) ? 1 : 0;
  return {
    nextNodeId,
    nextReviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, {
          handledAt: args.now,
          nextNodeId,
          queueNodeIds: remainingQueueNodeIds.length > 0 ? remainingQueueNodeIds : nextQueue.currentNodeId ? nextQueue.taskNodeIds : [],
          readingElapsedMsDelta,
          readTopicDelta,
          soonNodeIds: nextSoonNodeIds
        })
      : completeReviewSession(args.snapshot.reviewSession, {
          completedAt: args.now,
          continueNodeId,
          readingElapsedMsDelta,
          readTopicDelta
        })
  };
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
  const beforeReading = cloneReadingProfile(result.beforeReading);
  const afterReading = cloneReadingProfile(result.afterReading);
  const { nextNodeId, nextReviewSession } = buildNextDismissReviewSession({ ...args, nextNodesById: result.nextNodesById });
  return {
    nextNodesForSync: result.nextNodesForSync,
    patch: {
      ...buildReviewActiveNodeContext(args.state, nextNodeId ?? nextReviewSession.continueNodeId ?? null),
      appActionHistory: pushWorkspaceUndoEntry(
        args.state.appActionHistory,
        createTopicDismissHistoryEntry({
          afterReading,
          afterReviewSession: nextReviewSession,
          beforeReading,
          beforeReviewSession: args.snapshot.reviewSession,
          nodeId: args.currentNodeId,
          ...(result.sequentialChanges.length ? { relatedReadings: result.sequentialChanges } : {})
        })
      ),
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
    pendingNodeIds.add(currentNodeId);
    try {
      if (!result || !(await persistReadingReviewNodes(result.nextNodesForSync, persistence))) {
        return false;
      }
      set((state) => {
        const node = state.nodesById[currentNodeId];
        if (!node || state.reviewSession.currentNodeId !== currentNodeId || state.activeNodeId !== currentNodeId) {
          return state;
        }
        return result?.patch ?? state;
      });
      return true;
    } finally {
      pendingNodeIds.delete(currentNodeId);
    }
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
    nextNodesForSync.forEach((node) => syncNodeContentToRuntime(node));
    return true;
  };
}
