import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
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
  acceptWorkspaceHistoryCommand(set, 'preserve', (state) => {
    if (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
        state.appActionHistory.pendingCreate) return state;
    if (!isReviewGradeApplicable(state, entry)) return state;
    began = true;
    return { appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) };
  });
  return began;
}

function isReviewGradeApplicable(state: WorkspaceState, entry: WorkspaceReviewGradeHistoryEntry) {
  const node = state.nodesById[entry.nodeId];
  return Boolean(node && !state.trashedNodeIds.includes(entry.nodeId) &&
    isSameReviewProfile(node.review ?? null, entry.beforeReview) &&
    isSameWorkspaceReviewSession(state.reviewSession, entry.beforeContext.reviewSession));
}

function settleReviewGradeHistory(set: WorkspaceSet, gradedState: NonNullable<ReturnType<typeof buildGradedReviewState>>) {
  let applied = false;
  let undoRequested = false;
  const entry = gradedState.historyEntry;
  set((state) => {
    const applicable = state.appActionHistory.pendingAction?.entry.id === entry.id &&
      isReviewGradeApplicable(state, entry);
    if (!applicable) return { appActionHistory: createEmptyWorkspaceActionHistory() };
    const settled = settleWorkspaceAction({ ...state.appActionHistory,
      pendingAction: { ...state.appActionHistory.pendingAction!, entry }
    }, entry.id);
    applied = true;
    undoRequested = settled.undoRequested;
    return { ...gradedState.patch,
      nodesById: { ...state.nodesById, [entry.nodeId]: {
        ...state.nodesById[entry.nodeId]!, review: entry.afterReview
      } },
      appActionHistory: settled.history };
  });
  return { applied, undoRequested };
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
  let gradedState = buildGradedReviewState({
    snapshot: args.snapshot,
    currentNodeId: args.currentNodeId,
    nodePatch: args.result.nodePatch,
    now: args.now
  });
  if (!gradedState) return false;
  if (!beginReviewGradeHistory(args.set, gradedState.historyEntry)) return false;
  let persisted = false;
  try {
    const result = await persistReviewGradeMutation({
      currentNodeId: args.currentNodeId,
      opId: gradedState.historyEntry.id,
      grade: args.grade,
      reviewedAt: args.result.reviewedAt,
      schedulerVersion: args.result.schedulerVersion,
      cardBefore: args.result.cardBefore,
      cardAfter: args.result.cardAfter
    }, args.persistence);
    persisted = Boolean(result);
    if (result && typeof result !== 'boolean') gradedState = withProjection(args, gradedState, result.card);
  } catch {
    persisted = false;
  }
  if (!persisted) {
    args.set((state) => ({
      appActionHistory: failWorkspaceAction(state.appActionHistory, gradedState.historyEntry.id)
    }));
    return false;
  }
  const { applied, undoRequested } = settleReviewGradeHistory(args.set, gradedState);
  if (!applied) return false;
  if (undoRequested) args.get().undoWorkspaceAction(gradedState.historyEntry.id);
  return true;
}

function withProjection(args: Parameters<typeof commitWorkspaceReviewGrade>[0],
  current: NonNullable<ReturnType<typeof buildGradedReviewState>>,
  card: import('../features/review/model/reviewTypes').SchedulerCard | null) {
  const computed = buildGradedReviewState({ snapshot: args.snapshot, currentNodeId: args.currentNodeId,
    nodePatch: { review: card ? toNodeReviewProfile(card) : null }, now: args.now });
  return computed ? { ...computed, historyEntry: { ...computed.historyEntry, id: current.historyEntry.id } } : current;
}
