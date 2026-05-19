import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  advanceReviewSession,
  buildNextReadingProfile,
  completeReviewSession,
  resolveReadingPriorityChain
} from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { createReadingReviewHistoryPatch } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

function buildNextReadingReviewState(args: {
  currentNodeId: string;
  currentNode: Node;
  now: string;
  snapshot: WorkspaceState;
}) {
  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  return advanceReadingScheduleCoreFields({
    lastHandledAt: args.now,
    ...(args.currentNode.reading?.intervalDurationMs !== undefined ? { previousIntervalDurationMs: args.currentNode.reading.intervalDurationMs } : {}),
    previousRepetitionCount: args.currentNode.reading?.repetitionCount ?? 0,
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.currentNodeId,
      currentReading: args.currentNode.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.snapshot.nodesById
    }),
    ...(pushQueueSettings.readingInitialIntervalMs !== undefined ? { initialIntervalMs: pushQueueSettings.readingInitialIntervalMs } : {}),
    ...(pushQueueSettings.readingIntervalGrowthFactorRange ? { range: pushQueueSettings.readingIntervalGrowthFactorRange } : {})
  });
}

export function createDeferReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['deferReviewItem'] {
  return () => {
    const now = new Date().toISOString();
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextReading = buildNextReadingReviewState({ currentNode, currentNodeId, now, snapshot });
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = { ...node, reading: nextReadingProfile, updatedAt: now };
      nextNodeForSync = nextNode;
      const reviewSession = nextNodeId
        ? advanceReviewSession(snapshot.reviewSession, { nextNodeId, queueNodeIds: nextQueue })
        : completeReviewSession(snapshot.reviewSession, { completedAt: now });
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        ...createReadingReviewHistoryPatch({
          afterReading: nextReadingProfile,
          afterReviewSession: reviewSession,
          beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession,
          nodeId: currentNodeId,
          state,
          title: 'Defer Topic'
        }),
        nodesById: { ...state.nodesById, [currentNodeId]: nextNode },
        reviewSession
      };
    });
    if (nextNodeForSync) syncNodeContentToRuntime(nextNodeForSync);
    return true;
  };
}

export function createCompleteReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['completeReviewItem'] {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextReading = buildNextReadingReviewState({ currentNode, currentNodeId, now, snapshot });
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = { ...node, reading: nextReadingProfile, updatedAt: now };
      nextNodeForSync = nextNode;
      const reviewSession = nextNodeId
        ? advanceReviewSession(snapshot.reviewSession, { nextNodeId, queueNodeIds: nextQueue, readTopicDelta: 1 })
        : completeReviewSession(snapshot.reviewSession, { completedAt: now, readTopicDelta: 1 });
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        ...createReadingReviewHistoryPatch({
          afterReading: nextReadingProfile,
          afterReviewSession: reviewSession,
          beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession,
          nodeId: currentNodeId,
          state,
          title: 'Complete Topic'
        }),
        nodesById: { ...state.nodesById, [currentNodeId]: nextNode },
        reviewSession
      };
    });
    if (nextNodeForSync) syncNodeContentToRuntime(nextNodeForSync);
    return true;
  };
}
