import { requestAppConfirmation } from '../../../shared/ui';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { collectDismissEntireTopicTargets } from './nodeListContextMenuReview';

export function confirmReturnNodeReset(targetCount: number) {
  return requestAppConfirmation({
    confirmLabel: 'Relearn',
    description:
      targetCount > 1
        ? 'This clears their current review progress and puts them back in the review queue.'
        : 'This clears its current review progress and puts it back in the review queue.',
    title: targetCount > 1 ? 'Relearn selected topics?' : 'Relearn this topic?'
  });
}

export function createReturnNodeAction(
  contextTargets: string[],
  returnNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    void confirmReturnNodeReset(contextTargets.length).then((confirmed) => {
      if (!confirmed) {
        closeContextMenu();
        return;
      }
      contextTargets.forEach((id) => returnNode(id));
      closeContextMenu();
    });
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
  targetNodeId: string | null,
  dismissNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (targetNodeId) dismissNode(targetNodeId);
    closeContextMenu();
  };
}

export function createShelveTopicAction(
  rootNodeId: string | null,
  shelveNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (rootNodeId) shelveNode(rootNodeId);
    closeContextMenu();
  };
}

export function createUnshelveTopicAction(
  rootNodeId: string | null,
  unshelveNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (rootNodeId) unshelveNode(rootNodeId);
    closeContextMenu();
  };
}

export function createToggleSequentialReadingAction(args: {
  closeContextMenu: () => void;
  nodesById: WorkspaceListNodesById;
  primaryTargetId: string | null;
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean;
}) {
  return () => {
    const node = args.primaryTargetId ? args.nodesById[args.primaryTargetId] : undefined;
    if (!args.primaryTargetId || !node) {
      args.closeContextMenu();
      return;
    }
    const nextEnabled = node.sequentialReadingEnabled !== true;
    args.setNodeSequentialReading(args.primaryTargetId, nextEnabled);
    args.closeContextMenu();
  };
}
