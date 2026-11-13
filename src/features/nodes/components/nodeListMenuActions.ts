import type { Translate } from '../../../shared/localization/LocalizationProvider';
import { requestAppConfirmation } from '../../../shared/ui';
import type { NodeDismissTargets } from '../model/nodeDismissTargets';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';


function confirmReturnNodeReset(targetCount: number, t: Translate) {
  const multiple = targetCount > 1;
  return requestAppConfirmation({
    confirmLabel: t('desktop.nodeList.menu.relearn'),
    description: t(multiple
      ? 'desktop.nodeList.relearn.multiple.description'
      : 'desktop.nodeList.relearn.single.description'),
    title: t(multiple ? 'desktop.nodeList.relearn.multiple.title' : 'desktop.nodeList.relearn.single.title')
  });
}

export function createReturnNodeAction(
  contextTargets: string[],
  returnNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void,
  t: Translate
) {
  return () => {
    void confirmReturnNodeReset(contextTargets.length, t).then((confirmed) => {
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
  dismissNodes: (targets: NodeDismissTargets, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (!rootNodeId) {
      closeContextMenu();
      return;
    }
    const now = new Date().toISOString();
    dismissNodes({ topicRootId: rootNodeId }, now);
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
  setNodeSequentialReading: (nodeId: string, enabled: boolean, now?: string) => boolean | Promise<boolean>;
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
