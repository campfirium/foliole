import { canNodeAcceptMovedNode } from './nodeMovementRules';
import type { Node } from './nodeTypes';
import { isHomeNode, isInboxNode, isVirtualNode, isVirtualRootNode } from './specialNodes';

export function canNodeAcceptMovedChildren(
  nodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node | undefined>,
  movedNodeId?: string | null,
  hiddenNodeIds?: ReadonlySet<string>
) {
  void nodeOrder;
  void hiddenNodeIds;
  const node = nodesById[nodeId];
  if (!node) {
    return false;
  }
  if (isHomeNode(node)) {
    return false;
  }
  if (isVirtualRootNode(node)) {
    return movedNodeId ? canNodeAcceptMovedNode(node, nodesById[movedNodeId]) : false;
  }
  if (isVirtualNode(node)) {
    return false;
  }
  if (!movedNodeId) {
    return isInboxNode(node) || node.kind !== 'item';
  }
  return canNodeAcceptMovedNode(node, nodesById[movedNodeId]);
}
