import type { Node } from '../model/nodeTypes';

export function canRelearnNode(node: Node | undefined) {
  return Boolean(node && node.reveal === null && node.content.trim().length > 0);
}

export function hasRelearnTargets(nodeIds: string[], nodesById: Record<string, Node>) {
  return nodeIds.some((nodeId) => canRelearnNode(nodesById[nodeId]));
}
