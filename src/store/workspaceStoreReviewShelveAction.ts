import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { pushWorkspaceUndoEntry } from './workspaceActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';
import { createTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';
import {
  persistReadingReviewNodes,
  type ReadingReviewPendingNodeIds
} from './workspaceStoreReadingReviewActions';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

function isReviewShelvableTopic(node: Node | undefined, state: WorkspaceState): node is Node {
  return Boolean(node && node.kind === 'topic' && isReadingReviewItemNode(node) && !node.anchorLink && !node.specialKind && !node.shelvedAt && !state.trashedNodeIds.includes(node.id));
}

function buildNextReviewSessionAfterShelve(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  snapshot: WorkspaceState;
}) {
  const soonNodeIds = (args.snapshot.reviewSession.soonNodeIds ?? []).filter((nodeId) => nodeId !== args.currentNodeId);
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.snapshot, args.now, {
    excludedNodeIds: [args.currentNodeId, ...soonNodeIds],
    nodesById: args.nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = nextQueue.currentNodeId ?? soonNodeIds[0] ?? null;
  const nextSoonNodeIds = nextQueue.currentNodeId ? soonNodeIds : soonNodeIds.slice(1);
  const readingElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const readTopicDelta = args.snapshot.reviewSession.queueNodeIds.includes(args.currentNodeId) ? 1 : 0;
  return nextNodeId
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
        continueNodeId: nextQueue.extensionNodeIds[0] ?? null,
        readingElapsedMsDelta,
        readTopicDelta
      });
}

function buildShelveReviewPatch(args: {
  currentNodeId: string;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
}) {
  const node = args.state.nodesById[args.currentNodeId];
  if (!isReviewShelvableTopic(node, args.state)) return null;
  const nextNode = { ...node, shelvedAt: args.now, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.currentNodeId]: nextNode };
  const sequentialPatch = buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: [args.currentNodeId],
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodeOrder: args.state.nodeOrder,
    nodesById: nextNodesById,
    now: args.now,
    previousNodesById: args.state.nodesById
  });
  const finalNodesById = sequentialPatch?.nodesById ?? nextNodesById;
  const nextReviewSession = buildNextReviewSessionAfterShelve({
    currentNodeId: args.currentNodeId,
    nextNodesById: finalNodesById,
    now: args.now,
    snapshot: args.snapshot
  });
  return {
    nextNodesForSync: [nextNode, ...(sequentialPatch?.changes ?? [])
      .map((change) => finalNodesById[change.nodeId])
      .filter((changedNode): changedNode is Node => Boolean(changedNode))],
    patch: {
      activeNodeId: nextReviewSession.currentNodeId ?? nextReviewSession.continueNodeId ?? args.state.activeNodeId,
      appActionHistory: pushWorkspaceUndoEntry(
        args.state.appActionHistory,
        createTopicShelveHistoryEntry({
          afterReviewSession: nextReviewSession,
          afterShelvedAt: args.now,
          beforeReviewSession: args.snapshot.reviewSession,
          beforeShelvedAt: node.shelvedAt ?? null,
          nodeId: args.currentNodeId,
          ...(sequentialPatch?.changes.length ? { relatedReadings: sequentialPatch.changes } : {})
        })
      ),
      nodesById: finalNodesById,
      reviewSession: nextReviewSession
    }
  };
}

export function createShelveReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds
) {
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId || pendingNodeIds.has(currentNodeId)) return false;
    const result = buildShelveReviewPatch({ currentNodeId, now, snapshot, state: get() });
    pendingNodeIds.add(currentNodeId);
    try {
      if (!result || !(await persistReadingReviewNodes(result.nextNodesForSync))) return false;
      set((state) => {
        const node = state.nodesById[currentNodeId];
        if (!node || state.reviewSession.currentNodeId !== currentNodeId || state.activeNodeId !== currentNodeId) {
          return state;
        }
        return result.patch;
      });
      return true;
    } finally {
      pendingNodeIds.delete(currentNodeId);
    }
  };
}
