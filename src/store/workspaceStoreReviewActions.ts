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
import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { prepareWorkspaceFlowDay } from './workspaceFlowDayAction';
import type { ReadingReviewPendingNodeIds } from './workspaceReadingReviewHistoryCommit';
import { commitWorkspaceReviewGrade } from './workspaceReviewGradeHistoryCommit';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { createEmptyReviewSession } from './workspaceReviewReading';
import type { ReviewSessionStartOptions, WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';
import {
  createReadReviewTopicActionWithPending,
  createPostponeReviewTopicActionWithPending,
  createRevisitReviewTopicSoonAction
} from './workspaceStoreReadingReviewActions';
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

function createGradeReviewCardAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter,
  persistence: WorkspaceReviewPersistenceAdapter
): WorkspaceReviewActions['gradeReviewCard'] {
  return async (grade: ReviewGrade, now = new Date().toISOString()) => {
    if (!await prepareWorkspaceFlowDay(set, get, now)) return false;
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) return false;
    if (snapshot.activeNodeId !== currentNodeId) return false;
    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || !isFsrsReviewItemNode(currentNode)) return false;
    if (!isActionableSessionNode(currentNode, now)) {
      await openWorkspaceDailyFlow(set, get, { now, mode: snapshot.reviewSessionMode, seed: snapshot.reviewSession, refresh: true });
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
    const committed = await commitWorkspaceReviewGrade({
      currentNodeId,
      get,
      grade,
      now,
      persistence,
      result,
      set,
      snapshot
    });
    if (!committed) return false;
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
    startReviewSession: createStartReviewSessionAction(set, options.startReviewSession, get),
    continueReviewSessionReading: createContinueReviewSessionReadingAction(set, get),
    resumeReviewSession: createResumeReviewSessionAction(set, get),
    setReviewSessionMode: createSetReviewSessionModeAction(set, get),
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
