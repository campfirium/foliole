import {
  beginWorkspaceStructureCreate,
  failWorkspaceStructureCreate,
  settleWorkspaceStructureCreate
} from './workspaceActionHistory';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { createStructureCreateEntry, isWorkspaceStructureKind } from './workspaceStructureHistoryEntries';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function beginStructureCreateHistory(args: {
  afterState: WorkspaceState;
  beforeState: WorkspaceState;
  history: WorkspaceState['appActionHistory'];
  node: WorkspaceState['nodesById'][string];
}) {
  if (!isWorkspaceStructureKind(args.node.kind)) return null;
  const entry = createStructureCreateEntry({
    afterActiveNodeId: args.afterState.activeNodeId,
    afterContext: captureWorkspaceHistoryContext(args.afterState),
    beforeActiveNodeId: args.beforeState.activeNodeId,
    beforeContext: captureWorkspaceHistoryContext(args.beforeState),
    kind: args.node.kind,
    nodeIds: [args.node.id],
    rootNodeId: args.node.id
  });
  return { entry, history: beginWorkspaceStructureCreate(args.history, entry) };
}

export function failStructureCreateHistory(args: {
  entryId: string | null;
  nodeId: string;
  set: WorkspaceSet;
}) {
  args.set((state) => {
    const nodeOrder = state.nodeOrder.filter((nodeId) => nodeId !== args.nodeId);
    const nodesById = { ...state.nodesById };
    delete nodesById[args.nodeId];
    const activeNodeId = state.activeNodeId === args.nodeId
      ? state.appActionHistory.pendingCreate?.entry.beforeActiveNodeId ?? null
      : state.activeNodeId;
    const nextState = { ...state, activeNodeId, nodeOrder, nodesById };
    return {
      activeNodeId,
      appActionHistory: args.entryId
        ? failWorkspaceStructureCreate(state.appActionHistory, args.entryId)
        : state.appActionHistory,
      nodeOrder,
      nodesById,
      reviewSession: reconcileReviewSession(nextState, activeNodeId)
    };
  });
}

export function completeStructureCreateHistory(args: {
  entryId: string | null;
  get?: () => WorkspaceState;
  set: WorkspaceSet;
}) {
  if (!args.entryId) return;
  let undoRequested = false;
  args.set((state) => {
    const settled = settleWorkspaceStructureCreate(state.appActionHistory, args.entryId!);
    undoRequested = settled.undoRequested;
    return { appActionHistory: settled.history };
  });
  if (undoRequested) args.get?.().undoWorkspaceAction(args.entryId);
}
