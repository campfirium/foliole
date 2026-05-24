import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import type { ReviewGrade, ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';
import { gradeSharedFsrsReviewNode } from '../features/review/model/sharedReviewGradeService';
import {
  getCurrentReviewSchedulerSettings,
  getReviewSchedulerVersion
} from '../features/settings/model/reviewSchedulerSettings';

import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession, createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
import { createCompleteReviewItemAction, createDeferReviewItemAction, createSoonReviewItemAction } from './workspaceStoreReadingReviewActions';
import { applyGradedReviewState, persistReviewGradeMutation } from './workspaceStoreReviewActionHelpers';
import { createDismissReviewItemAction } from './workspaceStoreReviewDismissAction';
import {
  createResumeReviewSessionAction,
  createSetReviewSessionModeAction,
  createStartReviewSessionAction
} from './workspaceStoreReviewSessionActions';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
type WorkspaceReviewActions = Pick<WorkspaceState, 'completeReviewItem' | 'deferReviewItem' | 'dismissReviewItem' | 'exitReviewSession' | 'gradeReviewCard' | 'resumeReviewSession' | 'revealReviewAnswer' | 'setReviewSessionMode' | 'soonReviewItem' | 'startReviewSession'>;
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
    const dueMs = parseTimestamp(node.review?.due ?? now);
    return dueMs === null || dueMs <= nowMs;
  }
  if (isReadingReviewItemNode(node)) {
    const nextAtMs = parseTimestamp(node.reading?.nextAt ?? node.createdAt);
    return nextAtMs === null || nextAtMs <= nowMs;
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
    activeNodeId: nextNodeId ?? args.snapshot.activeNodeId,
    reviewSession: nextNodeId
      ? advanceReviewSession(args.snapshot.reviewSession, { handledAt: args.now, nextNodeId, queueNodeIds: nextQueue.taskNodeIds })
      : completeReviewSession(args.snapshot.reviewSession, { completedAt: args.now, continueNodeId: nextQueue.extensionNodeIds[0] ?? null })
  });
}

function createGradeReviewCardAction(set: WorkspaceSet, get: WorkspaceGet, scheduler: ReviewSchedulerAdapter): WorkspaceReviewActions['gradeReviewCard'] {
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
      nodeId: currentNodeId,
      nodesById: snapshot.nodesById,
      now,
      scheduler
    });
    if (!result) return false;
    try {
      await persistReviewGradeMutation({
        currentNodeId,
        grade,
        reviewedAt: result.reviewedAt,
        cardBefore: result.cardBefore,
        cardAfter: result.cardAfter
      });
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
    resumeReviewSession: createResumeReviewSessionAction(set),
    setReviewSessionMode: createSetReviewSessionModeAction(set),
    revealReviewAnswer: createRevealReviewAnswerAction(set),
    gradeReviewCard: createGradeReviewCardAction(set, get, scheduler),
    completeReviewItem: createCompleteReviewItemAction(set, get),
    deferReviewItem: createDeferReviewItemAction(set, get),
    soonReviewItem: createSoonReviewItemAction(set, get),
    dismissReviewItem: createDismissReviewItemAction(set, get),
    exitReviewSession: createExitReviewSessionAction(set)
  };
}
