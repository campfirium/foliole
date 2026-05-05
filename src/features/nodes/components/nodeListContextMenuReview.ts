import { getReviewItemKind } from '../../review/model/reviewItemKind';
import { isFsrsReviewItemNode } from '../../review/model/reviewItemKind';
import type { Node } from '../model/nodeTypes';

export function canRelearnNode(node: Node | undefined) {
  if (!node || node.content.trim().length === 0) {
    return false;
  }
  if (isFsrsReviewItemNode(node)) {
    return true;
  }
  return getReviewItemKind(node) === 'reading' && node.reading !== null;
}

export function hasRelearnTargets(nodeIds: string[], nodesById: Record<string, Node>) {
  return nodeIds.some((nodeId) => canRelearnNode(nodesById[nodeId]));
}
