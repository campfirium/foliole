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

/** Browse lists top-level articles, plus child topics when the reader keeps them shown. */
export function isCompanionBrowseListTopic(snapshot: WorkspaceSnapshot, node: CompanionReadableNode | undefined,
  includeChildTopics: boolean) {
  if (!includeChildTopics) return isCompanionArticleNode(snapshot, node);
  return Boolean(node && node.kind === 'topic' && !node.anchorLink);
}
