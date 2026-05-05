import type { Node } from '../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade, type ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildCachedReviewQueuePlan } from './reviewQueuePlannerCached';
import { buildNextReadingProfile, createEmptyReviewSession, resolveReadingPriorityChain } from './workspaceReviewReading';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { applyGradedReviewState, persistReviewGradeMutation } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
type WorkspaceReviewActions = Pick<WorkspaceState, 'completeReviewItem' | 'deferReviewItem' | 'dismissReviewItem' | 'exitReviewSession' | 'gradeReviewCard' | 'revealReviewAnswer' | 'startReviewSession'>;
function buildReviewQueue(state: WorkspaceState, now: string): string[] {
  return buildCachedReviewQueuePlan({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    now,
    trashedNodeIds: state.trashedNodeIds
  }).queueNodeIds;
}
function createStartReviewSessionAction(set: WorkspaceSet): WorkspaceReviewActions['startReviewSession'] {
  return (now = new Date().toISOString()) => {
    let started = false;
    set((state) => {
      const queueNodeIds = buildReviewQueue(state, now);
      if (queueNodeIds.length === 0) return state;
      started = true;
      return {
        activeNodeId: queueNodeIds[0] ?? state.activeNodeId,
        reviewSession: { currentNodeId: queueNodeIds[0] ?? null, isAnswerRevealed: false, queueNodeIds, totalNodeCount: queueNodeIds.length }
      };
    });
    return started;
  };
}
function createRevealReviewAnswerAction(set: WorkspaceSet): WorkspaceReviewActions['revealReviewAnswer'] {
  return () => {
    set((state) => {
      if (!state.reviewSession.currentNodeId) return state;
      return { reviewSession: { ...state.reviewSession, isAnswerRevealed: true } };
    });
  };
}
function createDeferReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceReviewActions['deferReviewItem'] {
  return () => {
    const now = new Date().toISOString();
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    const remainingQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const currentReading = currentNode.reading;
    const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
    const nextReading = advanceReadingScheduleCoreFields({
      lastHandledAt: now,
      previousIntervalDurationMs: currentReading?.intervalDurationMs,
      previousRepetitionCount: currentReading?.repetitionCount ?? 0,
      priorityChain: resolveReadingPriorityChain({
        currentNodeId,
        currentReading,
        defaultPriority: pushQueueSettings.defaultPriority,
        nodesById: snapshot.nodesById
      }),
      initialIntervalMs: pushQueueSettings.readingInitialIntervalMs,
      range: pushQueueSettings.readingIntervalGrowthFactorRange
    });
    const nextNodeId = remainingQueue[0] ?? null;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = {
        ...node,
        reading: nextReadingProfile,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        nodesById: {
          ...state.nodesById,
          [currentNodeId]: nextNode
        },
        reviewSession: nextNodeId
          ? {
              currentNodeId: nextNodeId,
              isAnswerRevealed: false,
              queueNodeIds: remainingQueue,
              totalNodeCount: snapshot.reviewSession.totalNodeCount
            }
          : createEmptyReviewSession()
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
function createCompleteReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceReviewActions['completeReviewItem'] {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    const currentReading = currentNode.reading;
    const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
    const nextReading = advanceReadingScheduleCoreFields({
      lastHandledAt: now,
      previousIntervalDurationMs: currentReading?.intervalDurationMs,
      previousRepetitionCount: currentReading?.repetitionCount ?? 0,
      priorityChain: resolveReadingPriorityChain({
        currentNodeId,
        currentReading,
        defaultPriority: pushQueueSettings.defaultPriority,
        nodesById: snapshot.nodesById
      }),
      initialIntervalMs: pushQueueSettings.readingInitialIntervalMs,
      range: pushQueueSettings.readingIntervalGrowthFactorRange
    });
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextReadingProfile = buildNextReadingProfile(nextReading, node.reading);
      const nextNode: Node = {
        ...node,
        reading: nextReadingProfile,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        nodesById: {
          ...state.nodesById,
          [currentNodeId]: nextNode
        },
        reviewSession: nextNodeId
          ? {
              currentNodeId: nextNodeId,
              isAnswerRevealed: false,
              queueNodeIds: nextQueue,
              totalNodeCount: snapshot.reviewSession.totalNodeCount
            }
          : createEmptyReviewSession()
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
function createDismissReviewItemAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceReviewActions['dismissReviewItem'] {
  return (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const nextNode: Node = {
        ...node,
        reading: node.reading
          ? {
              ...node.reading,
              state: 'dismissed'
            }
          : node.reading,
        updatedAt: now
      };
      nextNodeForSync = nextNode;
      return {
        activeNodeId: nextNodeId ?? state.activeNodeId,
        nodesById: {
          ...state.nodesById,
          [currentNodeId]: nextNode
        },
        reviewSession: nextNodeId
          ? {
              currentNodeId: nextNodeId,
              isAnswerRevealed: false,
              queueNodeIds: nextQueue,
              totalNodeCount: snapshot.reviewSession.totalNodeCount
            }
          : createEmptyReviewSession()
      };
    });
    if (nextNodeForSync) {
      syncNodeContentToRuntime(nextNodeForSync);
    }
    return true;
  };
}
function createGradeReviewCardAction(set: WorkspaceSet, get: WorkspaceGet, scheduler: ReviewSchedulerAdapter): WorkspaceReviewActions['gradeReviewCard'] {
  return async (grade: ReviewGrade, now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isFsrsReviewItemNode(currentNode)) return false;
    const cardBefore = toSchedulerCard(currentNode.review, now);
    const result = await scheduler.grade({ card: cardBefore, grade, now });
    try {
      await persistReviewGradeMutation({ currentNodeId, grade, reviewedAt: result.reviewed_at, cardBefore, cardAfter: result.card });
    } catch {
      return false;
    }
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    const nextReviewProfile = toNodeReviewProfile(result.card);
    applyGradedReviewState({
      set,
      snapshot,
      currentNodeId,
      nextNodeId,
      nextQueue,
      nextReviewProfile,
      reviewedAt: result.reviewed_at,
      now
    });

    return true;
  };
}
function createExitReviewSessionAction(set: WorkspaceSet): WorkspaceReviewActions['exitReviewSession'] {
  return () => set(() => ({ reviewSession: createEmptyReviewSession() }));
}
export function createWorkspaceReviewActions(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter = createReviewSchedulerAdapter()
): WorkspaceReviewActions {
  return {
    startReviewSession: createStartReviewSessionAction(set),
    revealReviewAnswer: createRevealReviewAnswerAction(set),
    gradeReviewCard: createGradeReviewCardAction(set, get, scheduler),
    completeReviewItem: createCompleteReviewItemAction(set, get),
    deferReviewItem: createDeferReviewItemAction(set, get),
    dismissReviewItem: createDismissReviewItemAction(set, get),
    exitReviewSession: createExitReviewSessionAction(set)
  };
}
