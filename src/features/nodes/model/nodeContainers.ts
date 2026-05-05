import { canNodeAcceptMovedNode } from './nodeMovementRules';
import type { Node } from './nodeTypes';
import { hasNodeContent } from './nodeTypes';
import { isInboxNode } from './specialNodes';

function isVisibleNode(
  nodeId: string,
  nodesById: Record<string, Node | undefined>,
  hiddenNodeIds?: ReadonlySet<string>
) {
  return Boolean(nodesById[nodeId] && !hiddenNodeIds?.has(nodeId));
}

export function hasChildNodes(
  nodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node | undefined>,
  hiddenNodeIds?: ReadonlySet<string>
) {
  return nodeOrder.some(
    (candidateId) =>
      isVisibleNode(candidateId, nodesById, hiddenNodeIds) && nodesById[candidateId]?.parentNodeId === nodeId
  );
}

export function isNodeContentEmpty(node: Pick<Node, 'content' | 'hasContent'> | null | undefined) {
  return !hasNodeContent(node);
}

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
  if (!movedNodeId) {
    return isInboxNode(node) || node.kind !== 'item';
  }
  return canNodeAcceptMovedNode(node, nodesById[movedNodeId]);
}

export function isNodeContentLocked(
  nodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node | undefined>,
  hiddenNodeIds?: ReadonlySet<string>
) {
  const node = nodesById[nodeId];
  if (!node || isInboxNode(node)) {
    return false;
  }
  return isNodeContentEmpty(node) && hasChildNodes(nodeId, nodeOrder, nodesById, hiddenNodeIds);
}
