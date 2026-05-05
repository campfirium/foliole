import type { Node } from './nodeTypes';
import { isInboxNode } from './specialNodes';

export function hasChildNodes(nodeId: string, nodeOrder: string[], nodesById: Record<string, Node | undefined>) {
  return nodeOrder.some((candidateId) => nodesById[candidateId]?.parentNodeId === nodeId);
}

export function isNodeContentEmpty(node: Pick<Node, 'content'> | null | undefined) {
  return (node?.content ?? '').trim().length === 0;
}

export function canNodeAcceptMovedChildren(nodeId: string, nodeOrder: string[], nodesById: Record<string, Node | undefined>) {
  const node = nodesById[nodeId];
  if (!node || node.anchorLink) {
    return false;
  }
  return isInboxNode(node) || isNodeContentEmpty(node);
}

export function isNodeContentLocked(nodeId: string, nodeOrder: string[], nodesById: Record<string, Node | undefined>) {
  const node = nodesById[nodeId];
  if (!node || isInboxNode(node)) {
    return false;
  }
  return hasChildNodes(nodeId, nodeOrder, nodesById);
}
