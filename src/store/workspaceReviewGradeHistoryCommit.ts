import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { dailyFlowOperationId } from '../../lib/core/flow/dailyFlowRetry';
import { toNodeReviewProfile } from '../features/review/model/reviewTypes';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { hasPersistentDailyFlow, saveDailyGrade } from './workspaceDailyFlowMutations';
import { mergeDailyFlowReceiptNodes } from './workspaceDailyFlowReceipt';
import { recoverWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import { captureWorkspaceHistoryContext, isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { createReviewGradeHistoryEntry, isSameReviewProfile, type WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
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

function settleReviewGradeHistory(set: WorkspaceSet, gradedState: NonNullable<ReturnType<typeof buildGradedReviewState>>,
  beforeNodes: WorkspaceState['nodesById'], receiptNodes?: Record<string, WorkspaceNodeSnapshot>) {
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
      nodesById: { ...mergeDailyFlowReceiptNodes(state.nodesById, beforeNodes, receiptNodes), ...Object.fromEntries(Object.entries(gradedState.patch.nodesById).filter(([id]) => !state.nodesById[id])), [entry.nodeId]: {
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
  const entry = createPendingGradeEntry(args);
  if (!beginReviewGradeHistory(args.set, entry)) return false;
  let review: WorkspaceReviewGradeHistoryEntry['afterReview'] = args.result.nodePatch.review;
  let persisted = false;
  let persistedSession: WorkspaceState['reviewSession'] | undefined;
  let persistedSource: WorkspaceState['reviewSession'] | undefined;
  let receiptNodes: Record<string, WorkspaceNodeSnapshot> | undefined;
  try {
    const result = hasPersistentDailyFlow(args.snapshot.reviewSession)
      ? await saveDailyGrade(args.snapshot.reviewSession, entry, { nodeId: args.currentNodeId,
        grade: args.grade, reviewedAt: args.result.reviewedAt, schedulerVersion: args.result.schedulerVersion,
        cardBefore: args.result.cardBefore, cardAfter: args.result.cardAfter }, args.get().nodesById)
      : await persistReviewGradeMutation({
      currentNodeId: args.currentNodeId,
      opId: entry.id,
      grade: args.grade,
      reviewedAt: args.result.reviewedAt,
      schedulerVersion: args.result.schedulerVersion,
      cardBefore: args.result.cardBefore,
      cardAfter: args.result.cardAfter
    }, args.persistence);
    persisted = Boolean(result);
    if (result && typeof result !== 'boolean' && 'session' in result) { persistedSession = result.session; receiptNodes = result.nodes; persistedSource = result.sourceSession; }
    if (result && typeof result !== 'boolean') review = result.card ? toNodeReviewProfile(result.card) : null;
  } catch (error) {
    await recoverWorkspaceDailyFlow(args.set, args.get, error, args.now);
    persisted = false;
  }
  if (!persisted) {
    args.set((state) => ({
      appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id)
    }));
    return false;
  }
  const computed = buildGradedReviewState({ snapshot: { ...args.snapshot, nodesById: mergeDailyFlowReceiptNodes(args.snapshot.nodesById, {}, receiptNodes) }, currentNodeId: args.currentNodeId,
    nodePatch: { review }, now: args.now, ...(persistedSession ? { persistedSession } : {}) });
  if (!computed) return false;
  const gradedState = { ...computed, historyEntry: { ...computed.historyEntry, id: entry.id,
    ...(persistedSource ? { beforeContext: { ...computed.historyEntry.beforeContext, reviewSession: persistedSource } } : {}) } };
  const { applied, undoRequested } = settleReviewGradeHistory(args.set, gradedState, args.snapshot.nodesById, receiptNodes);
  if (!applied) return false;
  if (undoRequested) args.get().undoWorkspaceAction(gradedState.historyEntry.id);
  return true;
}

function createPendingGradeEntry(args: Parameters<typeof commitWorkspaceReviewGrade>[0]) {
  const context = captureWorkspaceHistoryContext(args.snapshot);
  return createReviewGradeHistoryEntry({
    afterContext: context,
    afterReview: args.result.nodePatch.review,
    beforeContext: context,
    beforeReview: args.snapshot.nodesById[args.currentNodeId]?.review ?? null,
    id: args.snapshot.reviewSession.daily ? dailyFlowOperationId(args.snapshot.reviewSession.daily, args.currentNodeId, `grade:${args.grade}`) : createWorkspaceActionHistoryEntryId(),
    mutationTimestamp: args.now,
    nodeId: args.currentNodeId
  });
}
