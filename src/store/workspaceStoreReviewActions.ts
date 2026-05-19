import { isFsrsReviewItemNode } from '../features/review/model/reviewItemKind';
import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade, type ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import { createEmptyReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
import { createCompleteReviewItemAction, createDeferReviewItemAction } from './workspaceStoreReadingReviewActions';
import { applyGradedReviewState, persistReviewGradeMutation } from './workspaceStoreReviewActionHelpers';
import { createDismissReviewItemAction } from './workspaceStoreReviewDismissAction';
import { createSetReviewSessionModeAction, createStartReviewSessionAction } from './workspaceStoreReviewSessionActions';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceGet = () => WorkspaceState;
type WorkspaceReviewActions = Pick<WorkspaceState, 'completeReviewItem' | 'deferReviewItem' | 'dismissReviewItem' | 'exitReviewSession' | 'gradeReviewCard' | 'revealReviewAnswer' | 'setReviewSessionMode' | 'startReviewSession'>;
function createRevealReviewAnswerAction(set: WorkspaceSet): WorkspaceReviewActions['revealReviewAnswer'] {
  return () => {
    set((state) => {
      if (!state.reviewSession.currentNodeId) return state;
      return { reviewSession: { ...state.reviewSession, isAnswerRevealed: true } };
    });
  };
}
function createGradeReviewCardAction(set: WorkspaceSet, get: WorkspaceGet, scheduler: ReviewSchedulerAdapter): WorkspaceReviewActions['gradeReviewCard'] {
  return async (grade: ReviewGrade, now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) return false;
    if (snapshot.activeNodeId !== currentNodeId) return false;
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
    setReviewSessionMode: createSetReviewSessionModeAction(set),
    revealReviewAnswer: createRevealReviewAnswerAction(set),
    gradeReviewCard: createGradeReviewCardAction(set, get, scheduler),
    completeReviewItem: createCompleteReviewItemAction(set, get),
    deferReviewItem: createDeferReviewItemAction(set, get),
    dismissReviewItem: createDismissReviewItemAction(set, get),
    exitReviewSession: createExitReviewSessionAction(set)
  };
}
