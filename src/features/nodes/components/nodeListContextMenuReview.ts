import { getReviewItemKind } from '../../review/model/reviewItemKind';
import { isFsrsReviewItemNode } from '../../review/model/reviewItemKind';
import type { Node } from '../model/nodeTypes';

function hasReviewableContent(node: Node | undefined) {
  return Boolean(node && node.content.trim().length > 0);
}

export function canReturnNode(node: Node | undefined) {
  if (!hasReviewableContent(node)) {
    return false;
  }
  return Boolean(node && (isFsrsReviewItemNode(node) || node.reading !== null));
}

export function canDismissNode(node: Node | undefined) {
  if (!hasReviewableContent(node) || !node || isFsrsReviewItemNode(node)) {
    return false;
  }
  return node.reading?.state !== 'dismissed';
}

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

export function hasReturnTargets(nodeIds: string[], nodesById: Record<string, Node>) {
  return nodeIds.some((nodeId) => canReturnNode(nodesById[nodeId]));
}

export function hasDismissTargets(nodeIds: string[], nodesById: Record<string, Node>) {
  return nodeIds.some((nodeId) => canDismissNode(nodesById[nodeId]));
}
