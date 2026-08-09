import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';
import { HOME_NODE_ID, VIRTUAL_ROOT_NODE_ID, isVirtualNode } from '../features/nodes/model/specialNodes';

import { resolveNextParentNodeId, type NodeDropIntent } from './workspaceMoveNodes';
import { isNodeInSubtree } from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';

export function canCreateChildUnderParent(
  state: WorkspaceState,
  parentNodeId: string,
  childKind: 'folder' | 'topic' | 'item'
) {
  const parentNode = state.nodesById[parentNodeId];
  if (
    !parentNode ||
    parentNodeId === HOME_NODE_ID ||
    parentNodeId === VIRTUAL_ROOT_NODE_ID ||
    parentNode.specialKind === 'home' ||
    parentNode.specialKind === 'virtual'
  ) {
    return false;
  }
  return canCreateChildNodeKind(parentNode.kind, childKind);
}

export function canMoveRootsIntoTarget(
  state: WorkspaceState,
  rootNodeIds: string[],
  movedNodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  if (targetNodeId && movedNodeIds.includes(targetNodeId)) {
    return false;
  }
  const nextParentNodeId = resolveNextParentNodeId(intent, targetNodeId, state.nodesById);
  if (
    intent === 'child' &&
    targetNodeId &&
    rootNodeIds.some((rootNodeId) => isNodeInSubtree(targetNodeId, rootNodeId, state.nodesById))
  ) {
    return false;
  }
  const movingVirtualNode = rootNodeIds.some((rootNodeId) => state.nodesById[rootNodeId]?.specialKind === 'virtual');
  if (movingVirtualNode) {
    return rootNodeIds.every((rootNodeId) => isVirtualNode(state.nodesById[rootNodeId])) &&
      (nextParentNodeId === VIRTUAL_ROOT_NODE_ID || isVirtualNode(state.nodesById[nextParentNodeId ?? '']));
  }
  if (nextParentNodeId === HOME_NODE_ID || nextParentNodeId === VIRTUAL_ROOT_NODE_ID) {
    return false;
  }
  if (nextParentNodeId === null) {
    return rootNodeIds.every((rootNodeId) => state.nodesById[rootNodeId]?.kind === 'folder');
  }
  const nextParentKind = nextParentNodeId ? state.nodesById[nextParentNodeId]?.kind ?? null : null;
  return rootNodeIds.every((rootNodeId) => {
    const movedNode = state.nodesById[rootNodeId];
    return movedNode ? canCreateChildNodeKind(nextParentKind, movedNode.kind) : false;
  });
}
