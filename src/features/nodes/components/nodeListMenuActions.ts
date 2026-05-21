import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { collectDismissEntireTopicTargets } from './nodeListContextMenuReview';

const SEQUENTIAL_READING_CONFIRM_COPY =
  'Enable sequential reading for this source topic? Topics under it will enter the queue in tree order. Only after the earlier topic is Dismissed will the next topic be pushed.';

const SEQUENTIAL_READING_SPARSE_CONFIRM_COPY =
  'This source topic does not have multiple derived topics. Enabling sequential reading may not noticeably change how topics are pushed.';

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

function countDerivedTopics(rootNodeId: string, nodesById: WorkspaceListNodesById) {
  let count = 0;
  const pending = [rootNodeId];
  while (pending.length > 0) {
    const currentId = pending.shift();
    for (const node of Object.values(nodesById)) {
      if (!node || node.parentNodeId !== currentId) {
        continue;
      }
      if (node.kind === 'topic') {
        count += 1;
      }
      pending.push(node.id);
    }
  }
  return count;
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
    if (nextEnabled) {
      const message =
        countDerivedTopics(args.primaryTargetId, args.nodesById) > 1
          ? SEQUENTIAL_READING_CONFIRM_COPY
          : SEQUENTIAL_READING_SPARSE_CONFIRM_COPY;
      if (!window.confirm(message)) {
        args.closeContextMenu();
        return;
      }
    }
    args.setNodeSequentialReading(args.primaryTargetId, nextEnabled);
    args.closeContextMenu();
  };
}
