import { canCreateChildNodeKind } from '../../lib/core/nodes/folderTopicItemCommands';

import { resolveNextParentNodeId, type NodeDropIntent } from './workspaceMoveNodes';
import { isNodeInSubtree } from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';

export function canCreateChildUnderParent(
  state: WorkspaceState,
  parentNodeId: string,
  childKind: 'folder' | 'topic' | 'item'
) {
  const parentNode = state.nodesById[parentNodeId];
  return Boolean(parentNode) && canCreateChildNodeKind(parentNode.kind, childKind);
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
  const nextParentKind = nextParentNodeId ? state.nodesById[nextParentNodeId]?.kind ?? null : null;
  if (
    intent === 'child' &&
    targetNodeId &&
    rootNodeIds.some((rootNodeId) => isNodeInSubtree(targetNodeId, rootNodeId, state.nodesById))
  ) {
    return false;
  }
  return rootNodeIds.every((rootNodeId) => {
    const movedNode = state.nodesById[rootNodeId];
    return Boolean(movedNode) && canCreateChildNodeKind(nextParentKind, movedNode.kind);
  });
}
