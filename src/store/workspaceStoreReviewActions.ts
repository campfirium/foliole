import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import type { ReviewGrade, ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';
import { gradeSharedFsrsReviewNode } from '../features/review/model/sharedReviewGradeService';
import {
  getCurrentReviewSchedulerSettings,
  getReviewSchedulerVersion
} from '../features/settings/model/reviewSchedulerSettings';

import { resolveReviewQueueReadingAvailableAt } from './reviewQueuePlannerReadingPaths';
import { isReviewProfileDue } from './reviewQueuePlannerTime';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { advanceReviewSession, completeReviewSession, createEmptyReviewSession } from './workspaceReviewReading';
import type { ReviewSessionStartOptions, WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import {
  createReadReviewTopicActionWithPending,
  createPostponeReviewTopicActionWithPending,
  createRevisitReviewTopicSoonAction,
  type ReadingReviewPendingNodeIds
} from './workspaceStoreReadingReviewActions';
import { applyGradedReviewState, persistReviewGradeMutation } from './workspaceStoreReviewActionHelpers';
import { createDismissReviewTopicActionWithPending } from './workspaceStoreReviewDismissAction';
import {
  createContinueReviewSessionReadingAction,
  createResumeReviewSessionAction,
  createSetReviewSessionModeAction,
  createStartReviewSessionAction
} from './workspaceStoreReviewSessionActions';
import { createSetReviewTopicDelayActionWithPending } from './workspaceStoreTopicDelayAction';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
type WorkspaceReviewActions = Pick<WorkspaceState, 'continueReviewSessionReading' | 'readReviewTopic' | 'postponeReviewTopic' | 'setReviewTopicDelay' | 'dismissReviewTopic' | 'exitReviewSession' | 'gradeReviewCard' | 'resumeReviewSession' | 'revealReviewAnswer' | 'setReviewSessionMode' | 'revisitReviewTopicSoon' | 'startReviewSession'>;
function createRevealReviewAnswerAction(set: WorkspaceSet): WorkspaceReviewActions['revealReviewAnswer'] {
  return () => {
    set((state) => {
      if (!state.reviewSession.currentNodeId) return state;
      return { reviewSession: { ...state.reviewSession, isAnswerRevealed: true } };
    });
  };
}

function parseTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function isActionableSessionNode(node: WorkspaceState['nodesById'][string] | undefined, now: string) {
  if (!node) return false;
  const nowMs = parseTimestamp(now);
  if (nowMs === null) return true;
  if (isFsrsReviewItemNode(node)) {
    try {
      return isReviewProfileDue(node.review, now, getCurrentReviewSchedulerSettings().newDayStartsAtHour);
    } catch {
      return true;
    }
  }
  if (isReadingReviewItemNode(node)) {
    const availableAtMs = parseTimestamp(resolveReviewQueueReadingAvailableAt(node));
    return availableAtMs === null || availableAtMs <= nowMs;
  }
  return false;
}

function skipStaleReviewCard(args: {
  currentNodeId: string;
  now: string;
  set: WorkspaceSet;
  snapshot: WorkspaceState;
}) {
  const nextQueue = buildCurrentReviewSessionQueueOutput(args.snapshot, args.now, { releaseCurrentPin: true });
  const nextNodeId = nextQueue.currentNodeId;
  args.set({
    ...buildReviewActiveNodeContext(args.snapshot, nextNodeId),
    reviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, { handledAt: args.now, nextNodeId, queueNodeIds: nextQueue.taskNodeIds })
      : completeReviewSession(args.snapshot.reviewSession, { completedAt: args.now, continueNodeId: nextQueue.extensionNodeIds[0] ?? null })
  });
}

function createGradeReviewCardAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter,
  persistence: WorkspaceReviewPersistenceAdapter
): WorkspaceReviewActions['gradeReviewCard'] {
  return async (grade: ReviewGrade, now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) return false;
    if (snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isFsrsReviewItemNode(currentNode)) return false;
    if (!isActionableSessionNode(currentNode, now)) {
      skipStaleReviewCard({ currentNodeId, now, set, snapshot });
      return true;
    }
    const result = await gradeSharedFsrsReviewNode({
      getSchedulerVersion: (overrides) => getReviewSchedulerVersion(getCurrentReviewSchedulerSettings(), overrides),
      grade,
      newDayStartsAtHour: getCurrentReviewSchedulerSettings().newDayStartsAtHour,
      nodeId: currentNodeId,
      nodesById: snapshot.nodesById,
      now,
      scheduler
    });
    if (!result) return false;
    try {
      const persisted = await persistReviewGradeMutation({
        currentNodeId,
        grade,
        reviewedAt: result.reviewedAt,
        schedulerVersion: result.schedulerVersion,
        cardBefore: result.cardBefore,
        cardAfter: result.cardAfter
      }, persistence);
      if (!persisted) return false;
    } catch {
      return false;
    }
    applyGradedReviewState({
      set,
      snapshot,
      currentNodeId,
      nodePatch: result.nodePatch,
      reviewedAt: result.reviewedAt,
      now
    });
    const nextActiveNodeId = get().activeNodeId;
    if (nextActiveNodeId) void persistNodeOpened(set, nextActiveNodeId, now);

    return true;
  };
}
function createExitReviewSessionAction(set: WorkspaceSet): WorkspaceReviewActions['exitReviewSession'] {
  return () => set(() => ({ reviewSession: createEmptyReviewSession() }));
}
export function createWorkspaceReviewActions(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter = createReviewSchedulerAdapter(),
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence,
  options: { startReviewSession?: ReviewSessionStartOptions } = {}
): WorkspaceReviewActions {
  const readingPendingNodeIds: ReadingReviewPendingNodeIds = new Set();
  return {
    startReviewSession: createStartReviewSessionAction(set, options.startReviewSession),
    continueReviewSessionReading: createContinueReviewSessionReadingAction(set),
    resumeReviewSession: createResumeReviewSessionAction(set),
    setReviewSessionMode: createSetReviewSessionModeAction(set),
    revealReviewAnswer: createRevealReviewAnswerAction(set),
    gradeReviewCard: createGradeReviewCardAction(set, get, scheduler, persistence),
    readReviewTopic: createReadReviewTopicActionWithPending(set, get, readingPendingNodeIds, persistence),
    postponeReviewTopic: createPostponeReviewTopicActionWithPending(set, get, readingPendingNodeIds, persistence),
    setReviewTopicDelay: createSetReviewTopicDelayActionWithPending(set, get, readingPendingNodeIds, persistence),
    revisitReviewTopicSoon: createRevisitReviewTopicSoonAction(set, get),
    dismissReviewTopic: createDismissReviewTopicActionWithPending(set, get, readingPendingNodeIds, persistence),
    exitReviewSession: createExitReviewSessionAction(set)
  };
}
