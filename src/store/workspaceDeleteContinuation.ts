import { HOME_NODE_ID, isHomeNode } from '../features/nodes/model/specialNodes';

import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import type { WorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStoreTypes';
import type { DeleteNodeMutationResult } from './workspaceTrashMutations';

export interface WorkspaceDeleteContinuation {
  activeNodeId: string;
  folderId: string;
  candidates: readonly string[];
  isCurrent: () => boolean;
  getListedIds: () => ReadonlySet<string>;
}

function isTopLevelInFolder(state: WorkspaceState, folderId: string, id: string) {
  const node = state.nodesById[id];
  if (!node || node.kind === 'folder') return false;
  const parentId = node.parentNodeId;
  if (folderId === HOME_NODE_ID || isHomeNode(state.nodesById[folderId])) {
    return !parentId || state.nodesById[parentId]?.kind === 'folder';
  }
  return parentId === folderId;
}

export function applyWorkspaceDeleteContinuation(
  state: WorkspaceState,
  mutation: DeleteNodeMutationResult,
  continuation: WorkspaceDeleteContinuation | undefined
) {
  if (!continuation || state.activeNodeId !== continuation.activeNodeId ||
      !mutation.nodeIds.includes(continuation.activeNodeId)) return mutation.patch;

  const next = { ...state, ...mutation.patch };
  const { folderId } = continuation;
  const stillBrowsing = continuation.isCurrent() && state.browseRootNodeId === folderId;
  const listedIds = stillBrowsing ? continuation.getListedIds() : null;
  const activeNodeId = listedIds
    ? continuation.candidates.find(id => listedIds.has(id) &&
        isTopLevelInFolder(next, folderId, id) && isCanonicalVisibleNodeId(next, id)) ??
        (isCanonicalVisibleNodeId(next, folderId) ? folderId : null)
    : null;
  return { ...mutation.patch, activeNodeId, reviewSession: reconcileReviewSession(next, activeNodeId) };
}

export function captureSettledDeleteContext(
  entry: WorkspaceDeleteHistoryEntry,
  state: WorkspaceState,
  patch: DeleteNodeMutationResult['patch']
): WorkspaceDeleteHistoryEntry {
  const next = { ...state, ...patch };
  return { ...entry, afterContext: captureWorkspaceHistoryContext(next), afterNavigation: next.navigation };
}
