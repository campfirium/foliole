import type { MutableRefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  isReviewNodeAvailable,
  resolveReviewFirstChildNodeId,
  resolveReviewSiblingNodeId,
  resolveReviewSourceTopicNodeId
} from '../../features/review/model/reviewGameNavigation';
import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';

export interface ReviewKeyboardNavigationArgs {
  activeNodeId: string | null;
  deleteSourceTopicShortcuts: CommandShortcutSet | undefined;
  isSourceTopicDeleteDialogOpen: boolean;
  navigateBackShortcuts: CommandShortcutSet | undefined;
  navigateDownShortcuts: CommandShortcutSet | undefined;
  navigateForwardShortcuts: CommandShortcutSet | undefined;
  navigateNextSiblingShortcuts: CommandShortcutSet | undefined;
  navigateParentShortcuts: CommandShortcutSet | undefined;
  navigatePreviousSiblingShortcuts: CommandShortcutSet | undefined;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
  deleteReviewSourceTopic: (nodeId: string) => boolean;
  goBack: () => void;
  goForward: () => void;
  goParent: () => void;
  selectNode: (nodeId: string) => void;
}

export function tryRunShortcut(
  event: KeyboardEvent,
  shortcuts: CommandShortcutSet | undefined,
  action: () => void | boolean
) {
  if (!matchesShortcutSet(event, shortcuts)) {
    return false;
  }
  const result = action();
  if (result === false) {
    return false;
  }
  event.preventDefault();
  return true;
}

export function tryRunReviewNavigation(
  event: KeyboardEvent,
  args: ReviewKeyboardNavigationArgs,
  lastChildByParentIdRef: MutableRefObject<Record<string, string>>
) {
  const currentNodeId = args.activeNodeId;
  if (!currentNodeId) {
    return false;
  }
  if (tryRunShortcut(event, args.navigateParentShortcuts, () => {
    const parentNodeId = args.nodesById[currentNodeId]?.parentNodeId;
    if (!parentNodeId || !isReviewNodeAvailable(parentNodeId, args)) return false;
    lastChildByParentIdRef.current[parentNodeId] = currentNodeId;
    args.goParent();
    return true;
  })) return true;
  if (tryRunShortcut(event, args.navigateBackShortcuts, args.goBack)) return true;
  if (tryRunShortcut(event, args.navigateForwardShortcuts, args.goForward)) return true;
  if (tryRunReviewSibling(event, args, currentNodeId, -1, args.navigatePreviousSiblingShortcuts)) return true;
  if (tryRunReviewSibling(event, args, currentNodeId, 1, args.navigateNextSiblingShortcuts)) return true;
  return tryRunReviewDown(event, args, currentNodeId, lastChildByParentIdRef);
}

function tryRunReviewSibling(
  event: KeyboardEvent,
  args: ReviewKeyboardNavigationArgs,
  currentNodeId: string,
  direction: -1 | 1,
  shortcuts: CommandShortcutSet | undefined
) {
  return tryRunShortcut(event, shortcuts, () => {
    const siblingNodeId = resolveReviewSiblingNodeId(currentNodeId, direction, args);
    if (!siblingNodeId) return false;
    args.selectNode(siblingNodeId);
    return true;
  });
}

function tryRunReviewDown(
  event: KeyboardEvent,
  args: ReviewKeyboardNavigationArgs,
  currentNodeId: string,
  lastChildByParentIdRef: MutableRefObject<Record<string, string>>
) {
  return tryRunShortcut(event, args.navigateDownShortcuts, () => {
    const rememberedNodeId = lastChildByParentIdRef.current[currentNodeId];
    const targetNodeId = isReviewNodeAvailable(rememberedNodeId ?? null, args)
      ? rememberedNodeId
      : resolveReviewFirstChildNodeId(currentNodeId, args);
    if (!targetNodeId) return false;
    args.selectNode(targetNodeId);
    return true;
  });
}

export function tryRunDeleteSourceTopicShortcut(event: KeyboardEvent, args: ReviewKeyboardNavigationArgs) {
  return tryRunShortcut(event, args.deleteSourceTopicShortcuts, () => {
    if (args.isSourceTopicDeleteDialogOpen || !args.activeNodeId) {
      return false;
    }
    const sourceTopicId = resolveReviewSourceTopicNodeId(args.activeNodeId, args);
    return sourceTopicId ? args.deleteReviewSourceTopic(sourceTopicId) : false;
  });
}
