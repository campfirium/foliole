import { readDiveNode } from '../../lib/core/nodes/dive';
import { createVirtualNodeResultResolver } from '../../lib/core/nodes/virtualNodeResults';
import { collectShelvedTopicIds } from '../features/nodes/model/builtinVirtualTopicIds';
import { HOME_NODE_ID, VIRTUAL_PUBLISHED_NODE_ID, VIRTUAL_SHELVED_NODE_ID,
  isHomeNode, isVirtualNode } from '../features/nodes/model/specialNodes';
import { resolveDiveMembership } from '../shared/diveMembership';

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

function resolveResultMembers(state: WorkspaceState, folderId: string, listedIds: ReadonlySet<string>) {
  if (folderId === VIRTUAL_PUBLISHED_NODE_ID) return listedIds;
  if (folderId === VIRTUAL_SHELVED_NODE_ID) return new Set(collectShelvedTopicIds(state));
  const node = state.nodesById[folderId];
  const dive = readDiveNode(node);
  if (dive) return new Set(resolveDiveMembership(state, dive).topics);
  if (!isVirtualNode(node)) return null;
  const resolve = createVirtualNodeResultResolver({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    trashedNodeIds: new Set(state.trashedNodeIds)
  });
  return new Set(resolve({ activeNodeId: folderId, filter: node.virtualFilter, manualChildOrder: node.manualChildOrder }));
}

function resolveListedSuccessor(state: WorkspaceState, continuation: WorkspaceDeleteContinuation) {
  const { candidates, folderId } = continuation;
  const builtin = folderId === VIRTUAL_PUBLISHED_NODE_ID || folderId === VIRTUAL_SHELVED_NODE_ID;
  if (!builtin && !isCanonicalVisibleNodeId(state, folderId)) return null;

  const listedIds = continuation.getListedIds();
  const members = resolveResultMembers(state, folderId, listedIds);
  const successor = candidates.find(id => listedIds.has(id) && isCanonicalVisibleNodeId(state, id) &&
    (members ? members.has(id) : isTopLevelInFolder(state, folderId, id)));
  return successor ?? (builtin || isVirtualNode(state.nodesById[folderId]) && !readDiveNode(state.nodesById[folderId])
    ? null : folderId);
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
  const activeNodeId = stillBrowsing ? resolveListedSuccessor(next, continuation) : null;
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
