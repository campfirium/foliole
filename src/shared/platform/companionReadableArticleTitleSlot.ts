import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';

type CompanionReadableNode = WorkspaceSnapshot['nodesById'][string];

export function isCompanionArticleNode(snapshot: WorkspaceSnapshot, node: CompanionReadableNode | undefined) {
  if (!node || node.kind !== 'topic') {
    return false;
  }

  let parentNodeId = node.parentNodeId;
  while (parentNodeId) {
    const parentNode = snapshot.nodesById[parentNodeId];
    if (!parentNode || parentNode.kind !== 'folder') {
      return false;
    }
    parentNodeId = parentNode.parentNodeId;
  }

  return true;
}
