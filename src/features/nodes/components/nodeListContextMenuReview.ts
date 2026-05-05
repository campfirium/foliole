import {
  getWorkspaceListReviewItemKind,
  isFsrsWorkspaceListNode,
  type WorkspaceListNode,
  type WorkspaceListNodesById
} from '../model/workspaceListNode';

function hasReviewableContent(node: WorkspaceListNode | undefined) {
  return Boolean(node?.hasContent);
}

export function canReturnNode(node: WorkspaceListNode | undefined) {
  if (!hasReviewableContent(node)) {
    return false;
  }
  return Boolean(node && (isFsrsWorkspaceListNode(node) || node.reading !== null));
}

export function canDismissNode(node: WorkspaceListNode | undefined) {
  if (!hasReviewableContent(node) || !node || isFsrsWorkspaceListNode(node)) {
    return false;
  }
  return node.reading?.state !== 'dismissed';
}

export function canRelearnNode(node: WorkspaceListNode | undefined) {
  if (!node || !node.hasContent) {
    return false;
  }
  if (isFsrsWorkspaceListNode(node)) {
    return true;
  }
  return getWorkspaceListReviewItemKind(node) === 'reading' && node.reading !== null;
}

export function hasRelearnTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canRelearnNode(nodesById[nodeId]));
}

export function hasReturnTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canReturnNode(nodesById[nodeId]));
}

export function hasDismissTargets(nodeIds: string[], nodesById: WorkspaceListNodesById) {
  return nodeIds.some((nodeId) => canDismissNode(nodesById[nodeId]));
}
