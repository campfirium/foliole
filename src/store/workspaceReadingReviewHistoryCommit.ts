import type { Node } from '../features/nodes/model/nodeTypes';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { applyReadingSnapshot, applyRelatedReadingSnapshots, areRelatedReadingsValid, isSameReadingProfile } from './workspaceActionHistoryReading';
import { acceptWorkspaceHistoryCommand } from './workspaceHistoryCommandAcceptance';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import type { WorkspaceState } from './workspaceStore';
import { resolveTopicReadingHistoryApply, type WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export type ReadingReviewPendingNodeIds = Set<string>;

export interface ReadingReviewPatchResult {
  historyEntry: WorkspaceTopicDismissHistoryEntry;
  nextNodesForSync: Node[];
  patch: Partial<WorkspaceState>;
  completedReviewDay?: string;
}

export function persistReadingReviewNodes(
  nodes: Node[],
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
) {
  return persistence.persistReadingNodes(nodes);
}

function applyCommittedReadingPatch(state: WorkspaceState, result: ReadingReviewPatchResult) {
  const entry = result.historyEntry;
  const node = state.nodesById[entry.nodeId];
  const apply = resolveTopicReadingHistoryApply(entry, 'redo');
  const affectedIds = [entry.nodeId, ...apply.relatedReadings.map(({ nodeId }) => nodeId)];
  const applicable = node && state.appActionHistory.pendingAction?.entry.id === entry.id &&
    !affectedIds.some(id => state.trashedNodeIds.includes(id)) &&
    isSameReadingProfile(node.reading, entry.beforeReading) &&
    areRelatedReadingsValid(apply.relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, entry.beforeContext.reviewSession);
  if (!applicable) return null;
  const nodesById = { ...state.nodesById, [entry.nodeId]: applyReadingSnapshot(node, entry.afterReading) };
  applyRelatedReadingSnapshots({ nextNodesById: nodesById, readings: apply.relatedReadings });
  const settled = settleWorkspaceAction(state.appActionHistory, entry.id);
  return {
    patch: { ...result.patch, nodesById, appActionHistory: settled.history },
    undoRequested: settled.undoRequested
  };
}

function settleCommittedReadingPatch(set: WorkspaceSet, result: ReadingReviewPatchResult) {
  let applied = false;
  let undoRequested = false;
  set((state) => {
    const committed = applyCommittedReadingPatch(state, result);
    if (!committed) return { appActionHistory: createEmptyWorkspaceActionHistory() };
    applied = true;
    undoRequested = committed.undoRequested;
    return committed.patch;
  });
  return { applied, undoRequested };
}

export async function persistAndApplyReadingReviewPatch(args: {
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
    if (!result) return false;
    let began = false;
    acceptWorkspaceHistoryCommand(args.set, 'preserve', (state) => {
      if (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
          state.appActionHistory.pendingCreate) return state;
      began = true;
      return { appActionHistory: beginWorkspaceAction(state.appActionHistory, result.historyEntry) };
    });
    if (!began) return false;
    let persisted = false;
    let invalidPersistence = false;
    try {
      persisted = result.completedReviewDay
        ? await args.persistence.persistReadingNodes(result.nextNodesForSync, undefined, result.completedReviewDay)
        : await persistReadingReviewNodes(result.nextNodesForSync, args.persistence);
    } catch (error) {
      invalidPersistence = isWorkspacePartialPersistenceError(error);
      persisted = false;
    }
    if (!persisted) {
      args.set((state) => ({
        appActionHistory: invalidPersistence
          ? createEmptyWorkspaceActionHistory()
          : failWorkspaceAction(state.appActionHistory, result.historyEntry.id)
      }));
      return false;
    }
    const { applied, undoRequested } = settleCommittedReadingPatch(args.set, result);
    if (!applied) return false;
    if (undoRequested) args.get().undoWorkspaceAction(result.historyEntry.id);
    const nextActiveNodeId = result.patch.reviewSession?.currentNodeId ?? result.patch.reviewSession?.continueNodeId;
    return { nextActiveNodeId, succeeded: true };
  } finally {
    args.pendingNodeIds.delete(args.currentNodeId);
  }
}
