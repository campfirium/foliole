import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import {
  buildNextReadingProfile,
  resolveReadingPriorityChain
} from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncNodeContentToRuntimeNow } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  advanceAfterSoonAction,
  advanceOrCompleteAfterReadingAction,
  isExistingQueueTopic
} from './workspaceStoreReadingReviewSessionFlow';
import { createReadingReviewHistoryPatch } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
export type ReadingReviewPendingNodeIds = Set<string>;

interface ReadingReviewPatchResult {
  nextNodesForSync: Node[];
  patch: Partial<WorkspaceState>;
}

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

export function createPostponeReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['postponeReviewTopic'] {
  return createPostponeReviewTopicActionWithPending(set, get, new Set());
}

export function createPostponeReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds
): WorkspaceState['postponeReviewTopic'] {
  return async () => {
    const now = new Date().toISOString();
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    const nextReading = buildNextReadingReviewState({ currentNode, currentNodeId, growthFactorExponent: 0.5, now, snapshot });
    return persistAndApplyReadingReviewPatch({
      currentNodeId,
      get,
      pendingNodeIds,
      set,
      buildPatch: (state) =>
        buildReadOrPostponeReadingReviewPatch({ currentNodeId, nextReading, now, snapshot, state, title: 'Later Topic' })
    });
  };
}

export function createReadReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['readReviewTopic'] {
  return createReadReviewTopicActionWithPending(set, get, new Set());
}

export function createReadReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds
): WorkspaceState['readReviewTopic'] {
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    const nextReading = buildNextReadingReviewState({ currentNode, currentNodeId, now, snapshot });
    return persistAndApplyReadingReviewPatch({
      currentNodeId,
      get,
      pendingNodeIds,
      set,
      buildPatch: (state) =>
        buildReadOrPostponeReadingReviewPatch({ currentNodeId, nextReading, now, snapshot, state, title: 'Read Topic' })
    });
  };
}

export function createRevisitReviewTopicSoonAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['revisitReviewTopicSoon'] {
  return async (now = new Date().toISOString()) => {
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

function buildReadOrPostponeReadingReviewPatch(args: {
  currentNodeId: string;
  nextReading: ReturnType<typeof buildNextReadingReviewState>;
  now: string;
  snapshot: WorkspaceState;
  state: WorkspaceState;
  title: 'Read Topic' | 'Later Topic';
}): ReadingReviewPatchResult | null {
  const node = args.state.nodesById[args.currentNodeId];
  if (!node) return null;
  const nextReadingProfile = buildNextReadingProfile(args.nextReading, node.reading);
  const nextNode: Node = { ...node, reading: nextReadingProfile, updatedAt: args.now };
  const nextNodesById = { ...args.state.nodesById, [args.currentNodeId]: nextNode };
  const reviewSession = advanceOrCompleteAfterReadingAction({
    currentNodeId: args.currentNodeId,
    nextNodesById,
    now: args.now,
    progressDelta: isExistingQueueTopic(args.snapshot.reviewSession, args.currentNodeId) ? 1 : 0,
    readingElapsedMsDelta: calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now),
    snapshot: args.snapshot,
    state: args.state
  });
  return {
    nextNodesForSync: [nextNode],
    patch: {
      activeNodeId: reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? args.state.activeNodeId,
      ...createReadingReviewHistoryPatch({
        afterReading: nextReadingProfile,
        afterReviewSession: reviewSession,
        beforeReading: node.reading,
        beforeReviewSession: args.snapshot.reviewSession,
        nodeId: args.currentNodeId,
        state: args.state,
        title: args.title
      }),
      nodesById: nextNodesById,
      reviewSession
    }
  };
}

export async function persistReadingReviewNodes(nodes: Node[]) {
  for (const node of nodes) {
    const persisted = await syncNodeContentToRuntimeNow(node);
    if (!persisted) return false;
  }
  return true;
}

async function persistAndApplyReadingReviewPatch(args: {
  buildPatch: (state: WorkspaceState) => ReadingReviewPatchResult | null;
  currentNodeId: string;
  get: WorkspaceGet;
  pendingNodeIds: ReadingReviewPendingNodeIds;
  set: WorkspaceSet;
}) {
  args.pendingNodeIds.add(args.currentNodeId);
  try {
    const result = args.buildPatch(args.get());
    if (!result || !(await persistReadingReviewNodes(result.nextNodesForSync))) {
      return false;
    }
    args.set((state) => {
      const currentNode = state.nodesById[args.currentNodeId];
      if (!currentNode || state.reviewSession.currentNodeId !== args.currentNodeId || state.activeNodeId !== args.currentNodeId) {
        return state;
      }
      return result?.patch ?? state;
    });
    return true;
  } finally {
    args.pendingNodeIds.delete(args.currentNodeId);
  }
}
