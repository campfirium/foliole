import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { NODE_TITLE_SLOT_PADDING_TOP, shouldReserveNodeTitleSlot } from '../lib/nodeTitleSlot';

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

export function resolveCompanionArticleContentPaddingTop(snapshot: WorkspaceSnapshot, node: CompanionReadableNode) {
  return shouldReserveNodeTitleSlot({
    content: node.content,
    hideTitleHeading: Boolean(node.hideTitleHeading),
    isPrimaryTopic: (candidate) => isCompanionArticleNode(snapshot, candidate),
    node,
    nodesById: snapshot.nodesById
  }) ? NODE_TITLE_SLOT_PADDING_TOP : undefined;
}
