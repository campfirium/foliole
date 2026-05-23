import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  buildNextReadingProfile,
  resolveReadingPriorityChain
} from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  advanceAfterSoonAction,
  advanceOrCompleteAfterReadingAction,
  isExistingQueueTopic
} from './workspaceStoreReadingReviewSessionFlow';
import { createReadingReviewHistoryPatch } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;

function buildNextReadingReviewState(args: {
  currentNodeId: string;
  currentNode: Node;
  growthFactorExponent?: number;
  now: string;
  snapshot: WorkspaceState;
}) {
  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const initialIntervalMs = pushQueueSettings.readingInitialIntervalMs;
  return advanceReadingScheduleCoreFields({
    ...(args.growthFactorExponent !== undefined ? { growthFactorExponent: args.growthFactorExponent } : {}),
    lastHandledAt: args.now,
    minimumIntervalMs: initialIntervalMs,
    ...(args.currentNode.reading?.intervalDurationMs !== undefined ? { previousIntervalDurationMs: args.currentNode.reading.intervalDurationMs } : {}),
    previousRepetitionCount: args.currentNode.reading?.repetitionCount ?? 0,
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.currentNodeId,
      currentReading: args.currentNode.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.snapshot.nodesById
    }),
    ...(initialIntervalMs !== undefined ? { initialIntervalMs } : {}),
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
    const nextReading = buildNextReadingReviewState({ currentNode, currentNodeId, growthFactorExponent: 0.5, now, snapshot });
    const readingElapsedMsDelta = calculateReviewStepElapsedMs(snapshot.reviewSession, now);
    const progressDelta = isExistingQueueTopic(snapshot.reviewSession, currentNodeId) ? 1 : 0;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = { ...node, reading: nextReadingProfile, updatedAt: now };
      nextNodeForSync = nextNode;
      const nextNodesById = { ...state.nodesById, [currentNodeId]: nextNode };
      const reviewSession = advanceOrCompleteAfterReadingAction({
        currentNodeId,
        nextNodesById,
        now,
        progressDelta,
        readingElapsedMsDelta,
        snapshot,
        state
      });
      return {
        activeNodeId: reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? state.activeNodeId,
        ...createReadingReviewHistoryPatch({
          afterReading: nextReadingProfile,
          afterReviewSession: reviewSession,
          beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession,
          nodeId: currentNodeId,
          state,
          title: 'Defer Topic'
        }),
        nodesById: nextNodesById,
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
    const readingElapsedMsDelta = calculateReviewStepElapsedMs(snapshot.reviewSession, now);
    const progressDelta = isExistingQueueTopic(snapshot.reviewSession, currentNodeId) ? 1 : 0;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = { ...node, reading: nextReadingProfile, updatedAt: now };
      nextNodeForSync = nextNode;
      const nextNodesById = { ...state.nodesById, [currentNodeId]: nextNode };
      const reviewSession = advanceOrCompleteAfterReadingAction({
        currentNodeId,
        nextNodesById,
        now,
        progressDelta,
        readingElapsedMsDelta,
        snapshot,
        state
      });
      return {
        activeNodeId: reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? state.activeNodeId,
        ...createReadingReviewHistoryPatch({
          afterReading: nextReadingProfile,
          afterReviewSession: reviewSession,
          beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession,
          nodeId: currentNodeId,
          state,
          title: 'Complete Topic'
        }),
        nodesById: nextNodesById,
        reviewSession
      };
    });
    if (nextNodeForSync) syncNodeContentToRuntime(nextNodeForSync);
    return true;
  };
}

export function createSoonReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['soonReviewItem'] {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode) || !currentNode.reading) return false;
    const readingElapsedMsDelta = calculateReviewStepElapsedMs(snapshot.reviewSession, now);
    const progressDelta = isExistingQueueTopic(snapshot.reviewSession, currentNodeId) ? 1 : 0;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node?.reading) return state;
      const reviewSession = advanceAfterSoonAction({
        currentNodeId,
        now,
        progressDelta,
        readingElapsedMsDelta,
        snapshot,
        state
      });
      return {
        activeNodeId: reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? state.activeNodeId,
        ...createReadingReviewHistoryPatch({
          afterReading: node.reading,
          afterReviewSession: reviewSession,
          beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession,
          nodeId: currentNodeId,
          state,
          title: 'Soon Topic'
        }),
        reviewSession
      };
    });
    return true;
  };
}
