import type { Node } from '../features/nodes/model/nodeTypes';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { isSameReadingProfile } from './workspaceActionHistoryReading';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import type { WorkspaceState } from './workspaceStore';
import type { WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

export type ReadingReviewPendingNodeIds = Set<string>;

export interface ReadingReviewPatchResult {
  historyEntry: WorkspaceTopicDismissHistoryEntry;
  nextNodesForSync: Node[];
  patch: Partial<WorkspaceState>;
}

export function persistReadingReviewNodes(
  nodes: Node[],
  persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence
) {
  return persistence.persistReadingNodes(nodes);
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
    args.set((state) => {
      if (state.appActionHistory.applying || state.appActionHistory.pendingAction ||
          state.appActionHistory.pendingCreate) return state;
      began = true;
      return { appActionHistory: beginWorkspaceAction(state.appActionHistory, result.historyEntry) };
    });
    if (!began) return false;
    let persisted = false;
    let invalidPersistence = false;
    try {
      persisted = await persistReadingReviewNodes(result.nextNodesForSync, args.persistence);
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
    let applied = false;
    let undoRequested = false;
    args.set((state) => {
      const node = state.nodesById[args.currentNodeId];
      const pending = state.appActionHistory.pendingAction;
      const applicable = node && pending?.entry.id === result.historyEntry.id &&
        isSameReadingProfile(node.reading, result.historyEntry.beforeReading) &&
        isSameWorkspaceReviewSession(state.reviewSession, result.historyEntry.beforeContext.reviewSession);
      if (!applicable) return { appActionHistory: createEmptyWorkspaceActionHistory() };
      const settled = settleWorkspaceAction(state.appActionHistory, result.historyEntry.id);
      applied = true;
      undoRequested = settled.undoRequested;
      return { ...result.patch, appActionHistory: settled.history };
    });
    if (!applied) return false;
    if (undoRequested) args.get().undoWorkspaceAction(result.historyEntry.id);
    const nextActiveNodeId = result.patch.reviewSession?.currentNodeId ?? result.patch.reviewSession?.continueNodeId;
    return { nextActiveNodeId, succeeded: true };
  } finally {
    args.pendingNodeIds.delete(args.currentNodeId);
  }
}
