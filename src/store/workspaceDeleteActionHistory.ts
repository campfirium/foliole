import type { Node } from '../features/nodes/model/nodeTypes';


import {
  syncNodeContentToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';

const DELETE_TOPIC_ACTION_TITLE = 'Delete Topic';

export interface WorkspaceTopicDeleteHistoryEntry {
  afterActiveNodeId: string | null;
  afterParentNodesById: Record<string, Node>;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeActiveNodeId: string | null;
  beforeParentNodesById: Record<string, Node>;
  beforeReviewSession: WorkspaceState['reviewSession'];
  beforeTrashedNodeDeletedAtById: Record<string, string | undefined>;
  deletedAt: string;
  nodeIds: string[];
  title: typeof DELETE_TOPIC_ACTION_TITLE;
  type: 'topic.delete';
}

interface DeleteMutationSnapshot {
  deletedAt: string;
  nodeIds: string[];
  parentNodesToSync: Node[];
  patch: Pick<WorkspaceState, 'activeNodeId' | 'reviewSession'>;
}

export interface TopicDeleteHistoryApplyResult {
  patch: Partial<WorkspaceState>;
  parentNodesToSync: Node[];
  syncPayload: { deletedAt: string; mode: 'redo'; nodeIds: string[] } | { mode: 'undo'; nodeIds: string[] };
}

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function cloneReviewSession(
  reviewSession: WorkspaceState['reviewSession'] | null | undefined
): WorkspaceState['reviewSession'] | null {
  return reviewSession ? { ...reviewSession, queueNodeIds: [...reviewSession.queueNodeIds] } : null;
}

function collectParentNodeSnapshots(state: WorkspaceState, parentNodes: Node[]) {
  return Object.fromEntries(
    parentNodes
      .map((node) => state.nodesById[node.id])
      .filter((node): node is Node => Boolean(node))
      .map((node) => [node.id, node])
  );
}

function collectDeletedAtSnapshots(state: WorkspaceState, nodeIds: string[]) {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, state.trashedNodeDeletedAtById[nodeId]]));
}

export function createTopicDeleteHistoryEntry(
  state: WorkspaceState,
  mutation: DeleteMutationSnapshot
): WorkspaceTopicDeleteHistoryEntry {
  return {
    afterActiveNodeId: mutation.patch.activeNodeId,
    afterParentNodesById: Object.fromEntries(mutation.parentNodesToSync.map((node) => [node.id, node])),
    afterReviewSession: cloneReviewSession(mutation.patch.reviewSession)!,
    beforeActiveNodeId: state.activeNodeId,
    beforeParentNodesById: collectParentNodeSnapshots(state, mutation.parentNodesToSync),
    beforeReviewSession: cloneReviewSession(state.reviewSession)!,
    beforeTrashedNodeDeletedAtById: collectDeletedAtSnapshots(state, mutation.nodeIds),
    deletedAt: mutation.deletedAt,
    nodeIds: [...mutation.nodeIds],
    title: DELETE_TOPIC_ACTION_TITLE,
    type: 'topic.delete'
  };
}

export function createTopicDeleteHistoryPatch(state: WorkspaceState, mutation: DeleteMutationSnapshot) {
  return {
    ...mutation.patch,
    appActionHistory: {
      redoStack: [],
      undoStack: [
        ...state.appActionHistory.undoStack,
        createTopicDeleteHistoryEntry(state, mutation)
      ].slice(Math.max(0, state.appActionHistory.undoStack.length + 1 - 50))
    }
  };
}

function restoreDeletedAtSnapshot(
  current: WorkspaceState['trashedNodeDeletedAtById'],
  entry: WorkspaceTopicDeleteHistoryEntry
) {
  const next = { ...current };
  for (const nodeId of entry.nodeIds) {
    const deletedAt = entry.beforeTrashedNodeDeletedAtById[nodeId];
    if (deletedAt === undefined) {
      delete next[nodeId];
    } else {
      next[nodeId] = deletedAt;
    }
  }
  return next;
}

function buildNodesPatch(state: WorkspaceState, nodesById: Record<string, Node>) {
  return Object.keys(nodesById).length === 0
    ? state.nodesById
    : {
        ...state.nodesById,
        ...nodesById
      };
}

function buildNavigationPatch(activeNodeId: string | null) {
  return { activeNodeId };
}

function applyUndoTopicDelete(
  state: WorkspaceState,
  entry: WorkspaceTopicDeleteHistoryEntry
): TopicDeleteHistoryApplyResult | null {
  if (!entry.nodeIds.every((nodeId) => state.nodesById[nodeId] && state.trashedNodeIds.includes(nodeId))) {
    return null;
  }
  const restoredNodeIds = new Set(entry.nodeIds);
  return {
    parentNodesToSync: Object.values(entry.beforeParentNodesById),
    patch: {
      ...buildNavigationPatch(entry.beforeActiveNodeId),
      nodesById: buildNodesPatch(state, entry.beforeParentNodesById),
      reviewSession: cloneReviewSession(entry.beforeReviewSession)!,
      trashedNodeDeletedAtById: restoreDeletedAtSnapshot(state.trashedNodeDeletedAtById, entry),
      trashedNodeIds: state.trashedNodeIds.filter((nodeId) => !restoredNodeIds.has(nodeId))
    },
    syncPayload: { mode: 'undo', nodeIds: entry.nodeIds }
  };
}

function applyRedoTopicDelete(
  state: WorkspaceState,
  entry: WorkspaceTopicDeleteHistoryEntry
): TopicDeleteHistoryApplyResult | null {
  if (!entry.nodeIds.every((nodeId) => state.nodesById[nodeId] && !state.trashedNodeIds.includes(nodeId))) {
    return null;
  }
  return {
    parentNodesToSync: Object.values(entry.afterParentNodesById),
    patch: {
      ...buildNavigationPatch(entry.afterActiveNodeId),
      nodesById: buildNodesPatch(state, entry.afterParentNodesById),
      reviewSession: cloneReviewSession(entry.afterReviewSession)!,
      trashedNodeDeletedAtById: {
        ...state.trashedNodeDeletedAtById,
        ...Object.fromEntries(entry.nodeIds.map((nodeId) => [nodeId, entry.deletedAt]))
      },
      trashedNodeIds: [...new Set([...state.trashedNodeIds, ...entry.nodeIds])]
    },
    syncPayload: { deletedAt: entry.deletedAt, mode: 'redo', nodeIds: entry.nodeIds }
  };
}

export function applyTopicDeleteHistoryEntry(
  state: WorkspaceState,
  entry: WorkspaceTopicDeleteHistoryEntry,
  mode: 'redo' | 'undo'
): TopicDeleteHistoryApplyResult | null {
  return mode === 'undo' ? applyUndoTopicDelete(state, entry) : applyRedoTopicDelete(state, entry);
}

export function syncTopicDeleteHistoryApply(result: TopicDeleteHistoryApplyResult) {
  for (const parentNode of result.parentNodesToSync) {
    syncNodeContentToRuntime(parentNode);
  }
  if (result.syncPayload.mode === 'undo') {
    void syncRestoreNodesToRuntime({ nodeIds: result.syncPayload.nodeIds });
    return;
  }
  syncSoftDeleteNodesToRuntime({
    deletedAt: result.syncPayload.deletedAt,
    nodeIds: result.syncPayload.nodeIds
  });
}

export function applyTopicDeleteWorkspaceHistory(args: {
  entry: WorkspaceTopicDeleteHistoryEntry;
  mode: 'redo' | 'undo';
  popInvalidTopEntry: (history: WorkspaceState['appActionHistory'], mode: 'redo' | 'undo') => WorkspaceState['appActionHistory'];
  set: WorkspaceSet;
  updateHistoryAfterApply: (
    history: WorkspaceState['appActionHistory'],
    entry: WorkspaceTopicDeleteHistoryEntry,
    mode: 'redo' | 'undo'
  ) => WorkspaceState['appActionHistory'];
}) {
  let deleteApply: TopicDeleteHistoryApplyResult | null = null;
  args.set((state) => {
    deleteApply = applyTopicDeleteHistoryEntry(state, args.entry, args.mode);
    if (!deleteApply) {
      return { appActionHistory: args.popInvalidTopEntry(state.appActionHistory, args.mode) };
    }
    return {
      ...deleteApply.patch,
      appActionHistory: args.updateHistoryAfterApply(state.appActionHistory, args.entry, args.mode)
    };
  });
  if (!deleteApply) return false;
  syncTopicDeleteHistoryApply(deleteApply);
  const activeNodeId = args.mode === 'undo' ? args.entry.beforeActiveNodeId : args.entry.afterActiveNodeId;
  if (activeNodeId) void persistNodeOpened(args.set, activeNodeId, new Date().toISOString());
  return true;
}
