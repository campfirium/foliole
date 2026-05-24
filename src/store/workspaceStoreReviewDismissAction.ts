import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  cloneReadingProfile,
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry
} from './workspaceActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  advanceReviewSession,
  buildDismissedReadingProfile,
  completeReviewSession
} from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import { buildSequentialReadingDismissPatch } from './workspaceSequentialReading';
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
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.state, args.now, {
    excludedNodeIds: [args.currentNodeId, ...soonNodeIds],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = nextQueue.currentNodeId ?? soonNodeIds[0] ?? null;
  const nextSoonNodeIds = nextQueue.currentNodeId ? soonNodeIds : soonNodeIds.slice(1);
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  const readingElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const readTopicDelta = args.snapshot.reviewSession.queueNodeIds.includes(args.currentNodeId) ? 1 : 0;
  return {
    nextNodeId,
    nextReviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, {
          handledAt: args.now,
          nextNodeId,
          queueNodeIds: nextQueue.currentNodeId ? nextQueue.taskNodeIds : [],
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
  const node = args.state.nodesById[args.currentNodeId];
  if (!node) return null;
  const beforeReading = cloneReadingProfile(node.reading);
  const afterReading = buildDismissedReadingProfile({
    currentNodeId: args.currentNodeId,
    currentReading: node.reading,
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodesById: args.state.nodesById,
    now: args.now
  });
  const nextNode: Node = { ...node, reading: afterReading, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.currentNodeId]: nextNode };
  const sequentialPatch = buildSequentialReadingDismissPatch({
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    dismissedNodeId: args.currentNodeId,
    nodeOrder: args.state.nodeOrder,
    nodesById: nextNodesById,
    now: args.now
  });
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  const { nextNodeId, nextReviewSession } = buildNextDismissReviewSession({ ...args, nextNodesById: finalNodesById });
  return {
    nextNodesForSync: [nextNode, ...(sequentialPatch?.changes ?? [])
      .map((change) => finalNodesById[change.nodeId])
      .filter((changedNode): changedNode is Node => Boolean(changedNode))],
    patch: {
      activeNodeId: nextNodeId ?? nextReviewSession.continueNodeId ?? args.state.activeNodeId,
      appActionHistory: pushWorkspaceUndoEntry(
        args.state.appActionHistory,
        createTopicDismissHistoryEntry({
          afterReading,
          afterReviewSession: nextReviewSession,
          beforeReading,
          beforeReviewSession: args.snapshot.reviewSession,
          nodeId: args.currentNodeId,
          ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
        })
      ),
      nodesById: finalNodesById,
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
  pendingNodeIds: ReadingReviewPendingNodeIds
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
      if (!result || !(await persistReadingReviewNodes(result.nextNodesForSync))) {
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
