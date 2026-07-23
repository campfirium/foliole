import type { Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { buildReadingReviewDomainPatch } from './workspaceReadingReviewDomain';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
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

export function createPostponeReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['postponeReviewTopic'] {
  return createPostponeReviewTopicActionWithPending(set, get, new Set());
}

export function createPostponeReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds,
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
): WorkspaceState['postponeReviewTopic'] {
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    return persistAndApplyReadingReviewPatch({
      currentNodeId,
      get,
      pendingNodeIds,
      set,
      buildPatch: (state) =>
        buildReadOrPostponeReadingReviewPatch({ action: 'later', currentNodeId, now, snapshot, state, title: 'Later Topic' }),
      persistence
    });
  };
}

export function createReadReviewTopicAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['readReviewTopic'] {
  return createReadReviewTopicActionWithPending(set, get, new Set());
}

export function createReadReviewTopicActionWithPending(
  set: WorkspaceSet,
  get: WorkspaceGet,
  pendingNodeIds: ReadingReviewPendingNodeIds,
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
): WorkspaceState['readReviewTopic'] {
  return async (now = new Date().toISOString(), options = {}) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    return persistAndApplyReadingReviewPatch({
      currentNodeId,
      get,
      pendingNodeIds,
      set,
      buildPatch: (state) =>
        buildReadOrPostponeReadingReviewPatch({
          action: 'read',
          currentNodeId,
          now,
          releaseSequentialReading: options.releaseSequentialReading === true,
          snapshot,
          state,
          title: 'Read Topic'
        }),
      persistence
    });
  };
}

export function createRevisitReviewTopicSoonAction(set: WorkspaceSet, get: WorkspaceGet): WorkspaceState['revisitReviewTopicSoon'] {
  return async (now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    const readingElapsedMsDelta = calculateReviewStepElapsedMs(snapshot.reviewSession, now);
    const progressDelta = isExistingQueueTopic(snapshot.reviewSession, currentNodeId) ? 1 : 0;
    set((state) => {
      const node = state.nodesById[currentNodeId];
      if (!node) return state;
      const reviewSession = advanceAfterSoonAction({
        currentNodeId,
        now,
        progressDelta,
        readingElapsedMsDelta,
        snapshot,
        state
      });
      return {
        ...buildReviewActiveNodeContext(state, reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? null),
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
  action: 'read' | 'later';
  currentNodeId: string;
  now: string;
  releaseSequentialReading?: boolean;
  snapshot: WorkspaceState;
  state: WorkspaceState;
  title: 'Read Topic' | 'Later Topic';
}): ReadingReviewPatchResult | null {
  const result = buildReadingReviewDomainPatch(args);
  if (!result) return null;
  const reviewSession = advanceOrCompleteAfterReadingAction({
    currentNodeId: args.currentNodeId,
    nextNodesById: result.nextNodesById,
    now: args.now,
    progressDelta: isExistingQueueTopic(args.snapshot.reviewSession, args.currentNodeId) ? 1 : 0,
    readingElapsedMsDelta: calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now),
    snapshot: args.snapshot,
    state: args.state
  });
  return {
    nextNodesForSync: result.nextNodesForSync,
    patch: {
      ...buildReviewActiveNodeContext(args.state, reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? null),
      ...createReadingReviewHistoryPatch({
        afterReading: result.afterReading,
        afterReviewSession: reviewSession,
        beforeReading: result.beforeReading,
        beforeReviewSession: args.snapshot.reviewSession,
        nodeId: args.currentNodeId,
        ...(result.sequentialChanges.length ? { relatedReadings: result.sequentialChanges } : {}),
        state: args.state,
        title: args.title
      }),
      nodesById: result.nextNodesById,
      reviewSession
    }
  };
}

export async function persistReadingReviewNodes(
  nodes: Node[],
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
) {
  return persistence.persistReadingNodes(nodes);
}

async function persistAndApplyReadingReviewPatch(args: {
  buildPatch: (state: WorkspaceState) => ReadingReviewPatchResult | null;
  currentNodeId: string;
  get: WorkspaceGet;
  pendingNodeIds: ReadingReviewPendingNodeIds;
  persistence: WorkspaceReviewPersistenceAdapter;
  set: WorkspaceSet;
}) {
  args.pendingNodeIds.add(args.currentNodeId);
  try {
    const result = args.buildPatch(args.get());
    if (!result || !(await persistReadingReviewNodes(result.nextNodesForSync, args.persistence))) {
      return false;
    }
    args.set((state) => {
      const currentNode = state.nodesById[args.currentNodeId];
      if (!currentNode || state.reviewSession.currentNodeId !== args.currentNodeId || state.activeNodeId !== args.currentNodeId) {
        return state;
      }
      return result?.patch ?? state;
    });
    const nextActiveNodeId = result.patch.reviewSession?.currentNodeId ?? result.patch.reviewSession?.continueNodeId;
    if (nextActiveNodeId) void persistNodeOpened(args.set, nextActiveNodeId, new Date().toISOString());
    return true;
  } finally {
    args.pendingNodeIds.delete(args.currentNodeId);
  }
}
