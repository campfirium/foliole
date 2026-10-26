import { reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildReadingReviewDomainPatch } from './workspaceReadingReviewDomain';
import {
  persistAndApplyReadingReviewPatch,
  type ReadingReviewPatchResult,
  type ReadingReviewPendingNodeIds
} from './workspaceReadingReviewHistoryCommit';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import {
  advanceOrCompleteAfterReadingAction,
  isExistingQueueTopic
} from './workspaceStoreReadingReviewSessionFlow';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
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
    if (snapshot.appActionHistory.applying || snapshot.appActionHistory.pendingAction ||
        snapshot.appActionHistory.pendingCreate) return false;
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    const committed = await persistAndApplyReadingReviewPatch({
      currentNodeId,
      get,
      pendingNodeIds,
      set,
      buildPatch: (state) =>
        buildReadOrPostponeReadingReviewPatch({ action: 'later', currentNodeId, now, snapshot, state, title: 'Later Topic' }),
      persistence
    });
    if (committed && committed.nextActiveNodeId) {
      void persistNodeOpened(set, committed.nextActiveNodeId, new Date().toISOString());
    }
    return Boolean(committed);
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
    if (snapshot.appActionHistory.applying || snapshot.appActionHistory.pendingAction ||
        snapshot.appActionHistory.pendingCreate) return false;
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isReadingReviewItemNode(currentNode)) return false;
    if (pendingNodeIds.has(currentNodeId)) return false;
    const committed = await persistAndApplyReadingReviewPatch({
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
    if (committed && committed.nextActiveNodeId) {
      void persistNodeOpened(set, committed.nextActiveNodeId, new Date().toISOString());
    }
    return Boolean(committed);
  };
}

export { createRevisitReviewTopicSoonAction } from './workspaceDailySoonAction';

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
  const reviewSession = args.snapshot.reviewSession.daily
    ? args.snapshot.reviewSession : advanceOrCompleteAfterReadingAction({
    currentNodeId: args.currentNodeId,
    nextNodesById: result.nextNodesById,
    now: args.now,
    progressDelta: isExistingQueueTopic(args.snapshot.reviewSession, args.currentNodeId) ? 1 : 0,
    readingElapsedMsDelta: calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now),
    snapshot: args.snapshot,
    state: args.state
  });
  const activeContext = buildReviewActiveNodeContext(
    args.state,
    reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? null
  );
  return {
    ...(args.action === 'read' ? {
      completedReviewDay: reviewCalendarDayKey(new Date(args.now), getCurrentReviewSchedulerSettings().newDayStartsAtHour)
    } : {}),
    historyEntry: createReadingReviewHistoryEntry({
      afterActiveNodeId: activeContext.activeNodeId,
      ...('browseRootNodeId' in activeContext
        ? { afterBrowseRootNodeId: activeContext.browseRootNodeId }
        : {}),
      afterReading: result.afterReading,
      afterReviewSession: reviewSession,
      beforeReading: result.beforeReading,
      beforeReviewSession: args.snapshot.reviewSession,
      mutationTimestamp: args.now,
      nodeId: args.currentNodeId,
      ...(result.sequentialChanges.length ? { relatedReadings: result.sequentialChanges } : {}),
      state: args.state,
      title: args.title
    }),
    nextNodesForSync: result.nextNodesForSync,
    patch: {
      ...activeContext,
      nodesById: result.nextNodesById,
      reviewSession
    }
  };
}
