import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import {
  beginWorkspaceAction,
  createEmptyWorkspaceActionHistory,
  failWorkspaceAction,
  settleWorkspaceAction
} from './workspaceActionHistory';
import { createWorkspaceDeleteHistoryEntry, type WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { getWorkspaceHistoryPersistence } from './workspaceHistoryPersistence';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { commitSoftDeleteMutation, type TrashRuntimeHandlers } from './workspaceTrashRuntimeCommit';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

const TRASH_NOTICE_DURATION_MS = 8000;

function getTrashNoticeMessage(kind: 'folder' | 'topic') {
  return `${kind === 'folder' ? 'Folder' : 'Topic'} moved to Trash`;
}

function showTrashUndoNotice(entry: WorkspaceDeleteHistoryEntry, get: () => WorkspaceState) {
  if (entry.kind === 'item') return;
  showAppRuntimeNotice(
    getTrashNoticeMessage(entry.kind),
    'success',
    {
      label: 'Undo',
      onSelect: () => { get().undoWorkspaceAction(entry.id); }
    },
    {
      durationMs: TRASH_NOTICE_DURATION_MS,
      presentation: 'trash-row'
    }
  );
}

function isExactNodeSet(expectedNodeIds: string[], actualNodeIds: string[]) {
  if (expectedNodeIds.length !== actualNodeIds.length) return false;
  const actual = new Set(actualNodeIds);
  return expectedNodeIds.every((nodeId) => actual.has(nodeId));
}

async function commitWorkspaceDelete(
  runtimeHandlers: TrashRuntimeHandlers,
  mutation: DeleteNodeMutationResult
) {
  let result;
  try {
    result = await runtimeHandlers.syncSoftDeleteNodes({
      deletedAt: mutation.deletedAt,
      nodeIds: mutation.nodeIds
    });
  } catch {
    return { status: 'failed' as const };
  }
  if (!result) return { status: 'failed' as const };
  if (!isExactNodeSet(mutation.nodeIds, result.deletedNodeIds)) return { status: 'invalid' as const };
  let parentsPersisted = false;
  try {
    parentsPersisted = await getWorkspaceHistoryPersistence().persistNodeSnapshots(mutation.parentNodesToSync);
  } catch {
    parentsPersisted = false;
  }
  return parentsPersisted
    ? { deletedNodeIds: result.deletedNodeIds, status: 'applied' as const }
    : { status: 'invalid' as const };
}

function createDeleteEntry(snapshot: WorkspaceState, mutation: DeleteNodeMutationResult) {
  const rootNodeId = mutation.nodeIds[0];
  const kind = rootNodeId ? snapshot.nodesById[rootNodeId]?.kind : null;
  if (!rootNodeId || !kind) return null;
  return createWorkspaceDeleteHistoryEntry({
    afterState: { ...snapshot, ...mutation.patch },
    beforeState: snapshot,
    kind,
    mutation,
    rootNodeId
  });
}

async function deleteWithWorkspaceHistory(args: {
  get: () => WorkspaceState;
  nodeIds: string[];
  runtimeHandlers: TrashRuntimeHandlers;
  set: WorkspaceSet;
}) {
  const snapshot = args.get();
  if (snapshot.appActionHistory.applying || snapshot.appActionHistory.pendingAction ||
      snapshot.appActionHistory.pendingCreate) return;
  const mutation = computeDeleteNodesMutation(snapshot, args.nodeIds);
  if (!mutation) return;
  const entry = createDeleteEntry(snapshot, mutation);
  if (!entry) return;
  args.set((state) => ({ appActionHistory: beginWorkspaceAction(state.appActionHistory, entry) }));
  let result: Awaited<ReturnType<typeof commitWorkspaceDelete>>;
  try {
    result = await commitWorkspaceDelete(args.runtimeHandlers, mutation);
  } catch {
    result = { status: 'failed' };
  }
  let committed = false;
  let undoRequested = false;
  args.set((state) => {
    const pendingMatches = state.appActionHistory.pendingAction?.entry.id === entry.id;
    if (!pendingMatches || result.status === 'invalid') {
      return { appActionHistory: createEmptyWorkspaceActionHistory() };
    }
    if (result.status === 'failed') {
      return { appActionHistory: failWorkspaceAction(state.appActionHistory, entry.id) };
    }
    const currentMutation = computeDeleteNodesMutation(state, result.deletedNodeIds, mutation.deletedAt);
    if (!currentMutation || !isExactNodeSet(mutation.nodeIds, currentMutation.nodeIds)) {
      return { appActionHistory: createEmptyWorkspaceActionHistory() };
    }
    const settled = settleWorkspaceAction(state.appActionHistory, entry.id);
    committed = true;
    undoRequested = settled.undoRequested;
    return { ...currentMutation.patch, appActionHistory: settled.history };
  });
  if (!committed) return;
  showTrashUndoNotice(entry, args.get);
  if (undoRequested) args.get().undoWorkspaceAction(entry.id);
}

async function deleteWithoutWorkspaceHistory(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers,
  nodeIds: string[]
) {
  let mutation: DeleteNodeMutationResult | null = null;
  set((state) => {
    mutation = computeDeleteNodesMutation(state, nodeIds);
    return state;
  });
  const result = await commitSoftDeleteMutation(runtimeHandlers, mutation);
  set((state) => {
    const committed = result ? computeDeleteNodesMutation(state, result.deletedNodeIds) : null;
    return committed?.patch ?? state;
  });
}

export function createDeleteNodesAction(
  set: WorkspaceSet,
  runtimeHandlers: TrashRuntimeHandlers,
  get?: () => WorkspaceState
): WorkspaceState['deleteNodes'] {
  return async (nodeIds) => {
    if (get) await deleteWithWorkspaceHistory({ get, nodeIds, runtimeHandlers, set });
    else await deleteWithoutWorkspaceHistory(set, runtimeHandlers, nodeIds);
  };
}
