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
  hiddenNodeIds?: ReadonlySet<string>
) {
  void nodeOrder;
  void hiddenNodeIds;
  const node = nodesById[nodeId];
  if (!node || node.anchorLink) {
    return false;
  }
  return isInboxNode(node) || isNodeContentEmpty(node);
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
