import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { collectDismissEntireTopicTargets } from './nodeListContextMenuReview';

export function confirmReturnNodeReset(targetCount: number) {
  return window.confirm(
    targetCount > 1
      ? 'Reset review state and requeue the selected nodes?'
      : 'Reset review state and requeue this node?'
  );
}

export function createReturnNodeAction(
  contextTargets: string[],
  returnNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (!confirmReturnNodeReset(contextTargets.length)) {
      closeContextMenu();
      return;
    }
    contextTargets.forEach((id) => returnNode(id));
    closeContextMenu();
  };
}

export function createDismissEntireTopicAction(
  rootNodeId: string | null,
  nodesById: WorkspaceListNodesById,
  dismissNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (!rootNodeId) {
      closeContextMenu();
      return;
    }
    const now = new Date().toISOString();
    for (const nodeId of collectDismissEntireTopicTargets(rootNodeId, nodesById)) {
      dismissNode(nodeId, now);
    }
    closeContextMenu();
  };
}

export function createDismissNodeAction(
  contextTargets: string[],
  dismissNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    contextTargets.forEach((id) => dismissNode(id));
    closeContextMenu();
  };
}
