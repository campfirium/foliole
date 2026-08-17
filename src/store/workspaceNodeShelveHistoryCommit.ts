import type { Node } from '../features/nodes/model/nodeTypes';

import {
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { areRelatedReadingsValid } from './workspaceActionHistoryReading';
import {
  applyWorkspaceHistoryContext,
  isSameWorkspaceReviewSession
} from './workspaceHistoryContext';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import { isWorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import type { WorkspaceTopicShelveHistoryEntry } from './workspaceShelveActionHistory';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function isShelveEntryApplicable(state: WorkspaceState, entry: WorkspaceTopicShelveHistoryEntry) {
  const node = state.nodesById[entry.nodeId];
  const relatedReadings = (entry.relatedReadings ?? []).map((reading) => ({
    expectedReading: reading.afterReading ?? null,
    nextReading: reading.beforeReading ?? null,
    nodeId: reading.nodeId
  }));
  return Boolean(node &&
    (node.shelvedAt ?? null) === entry.afterShelvedAt &&
    areRelatedReadingsValid(relatedReadings, state.nodesById) &&
    isSameWorkspaceReviewSession(state.reviewSession, entry.afterContext.reviewSession));
}

function buildShelveFailurePatch(args: {
  beforeNodesById: WorkspaceState['nodesById'];
  entry: WorkspaceTopicShelveHistoryEntry;
  state: WorkspaceState;
}) {
  return {
    ...applyWorkspaceHistoryContext(args.entry.beforeContext),
    appActionHistory: failWorkspaceAction(args.state.appActionHistory, args.entry.id),
    nodesById: { ...args.state.nodesById, ...args.beforeNodesById }
  };
}

export function finishNodeShelveHistoryPersistence(args: {
  beforeNodesById: WorkspaceState['nodesById'];
  entry: WorkspaceTopicShelveHistoryEntry;
  get: () => WorkspaceState;
  nodes: Node[];
  now: string;
  set: WorkspaceSet;
}) {
  void getWorkspaceHistoryPersistence().persistShelveSnapshots(args.nodes, args.now).then((persisted) => {
    let undoRequested = false;
    args.set((state) => {
      if (!isShelveEntryApplicable(state, args.entry) ||
          state.appActionHistory.pendingAction?.entry.id !== args.entry.id) {
        return { appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      if (!persisted) return buildShelveFailurePatch({ ...args, state });
      const settled = settleWorkspaceAction(state.appActionHistory, args.entry.id);
      undoRequested = settled.undoRequested;
      return { appActionHistory: settled.history };
    });
    if (undoRequested) args.get().undoWorkspaceAction(args.entry.id);
  }).catch((error) => {
    args.set((state) => {
      if (isWorkspacePartialPersistenceError(error) || !isShelveEntryApplicable(state, args.entry)) {
        return { appActionHistory: createEmptyWorkspaceActionHistory() };
      }
      return buildShelveFailurePatch({ ...args, state });
    });
  });
}
