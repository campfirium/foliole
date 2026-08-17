import type { ReviewGrade } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { isSameReviewProfile, type WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import type { WorkspaceReviewPersistenceAdapter } from './workspaceReviewPersistence';
import type { WorkspaceState } from './workspaceStore';
import {
  buildGradedReviewState,
  persistReviewGradeMutation
} from './workspaceStoreReviewActionHelpers';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function beginReviewGradeHistory(set: WorkspaceSet, entry: WorkspaceReviewGradeHistoryEntry) {
  let began = false;
  set((state) => {
    if (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
        state.appActionHistory.pendingCreate) return state;
    began = true;
    return { appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) };
  });
  return began;
}

export async function commitWorkspaceReviewGrade(args: {
  currentNodeId: string;
  get: () => WorkspaceState;
  grade: ReviewGrade;
  now: string;
  persistence: WorkspaceReviewPersistenceAdapter;
  result: SharedReviewGradeResult;
  set: WorkspaceSet;
  snapshot: WorkspaceState;
}) {
  const gradedState = buildGradedReviewState({
    snapshot: args.snapshot,
    currentNodeId: args.currentNodeId,
    nodePatch: args.result.nodePatch,
    now: args.now
  });
  if (!gradedState) return false;
  if (!beginReviewGradeHistory(args.set, gradedState.historyEntry)) return false;
  let persisted = false;
  try {
    persisted = await persistReviewGradeMutation({
      currentNodeId: args.currentNodeId,
      grade: args.grade,
      reviewedAt: args.result.reviewedAt,
      schedulerVersion: args.result.schedulerVersion,
      cardBefore: args.result.cardBefore,
      cardAfter: args.result.cardAfter
    }, args.persistence);
  } catch {
    persisted = false;
  }
  if (!persisted) {
    args.set((state) => ({
      appActionHistory: failWorkspaceAction(state.appActionHistory, gradedState.historyEntry.id)
    }));
    return false;
  }
  let applied = false;
  let undoRequested = false;
  args.set((state) => {
    const node = state.nodesById[args.currentNodeId];
    const applicable = node &&
      state.appActionHistory.pendingAction?.entry.id === gradedState.historyEntry.id &&
      isSameReviewProfile(node.review, gradedState.historyEntry.beforeReview) &&
      isSameWorkspaceReviewSession(state.reviewSession, gradedState.historyEntry.beforeContext.reviewSession);
    if (!applicable) return { appActionHistory: createEmptyWorkspaceActionHistory() };
    const settled = settleWorkspaceAction(state.appActionHistory, gradedState.historyEntry.id);
    applied = true;
    undoRequested = settled.undoRequested;
    return { ...gradedState.patch, appActionHistory: settled.history };
  });
  if (!applied) return false;
  if (undoRequested) args.get().undoWorkspaceAction(gradedState.historyEntry.id);
  return true;
}
