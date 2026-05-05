import { useMemo } from 'react';

import { canNodeAcceptMovedChildren } from '../../features/nodes/model/nodeContainers';
import { isNodeInSubtree } from '../../store/workspaceNodeTreeOrder';

import { buildAppPaletteItems } from './appCommands';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import {
  isReviewShortcutCommand,
  useCommandShortcutState
} from './reviewHotkeysState';

function canNodeBeMoveTarget(args: {
  activeNodeId: string;
  nodeId: string;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>;
}) {
  if (args.nodeId === args.activeNodeId || args.ws.trashedNodeIds.includes(args.nodeId)) {
    return false;
  }
  if (isNodeInSubtree(args.nodeId, args.activeNodeId, args.ws.nodesById as Record<string, import('../../features/nodes/model/nodeTypes').Node>)) {
    return false;
  }
  return canNodeAcceptMovedChildren(
    args.nodeId,
    args.ws.nodeOrder,
    args.ws.nodesById,
    new Set(args.ws.trashedNodeIds)
  );
}

export function useAppPaletteItems(args: {
  activeNodeId: string | null;
  formalImportAvailable: boolean;
  hasReviewCard: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  reviewSession: ReturnType<typeof useWorkspaceSelectors>['reviewSession'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>;
}) {
  const hasNavigableNodes = useMemo(
    () => args.ws.nodeOrder.some((nodeId) => !args.ws.trashedNodeIds.includes(nodeId) && Boolean(args.ws.nodesById[nodeId])),
    [args.ws.nodeOrder, args.ws.nodesById, args.ws.trashedNodeIds]
  );
  const canMoveToNode = useMemo(
    () => {
      const activeNodeId = args.activeNodeId;
      return activeNodeId
        ? args.ws.nodeOrder.some((nodeId) => canNodeBeMoveTarget({ activeNodeId, nodeId, ws: args.ws }))
        : false;
    },
    [args.activeNodeId, args.ws.nodeOrder, args.ws.nodesById, args.ws.trashedNodeIds]
  );

  return useMemo(
    () =>
      buildAppPaletteItems({
        canImportFile: args.formalImportAvailable,
        canImportFolder: args.formalImportAvailable,
        canResetImportData: args.formalImportAvailable,
        canGoBack: args.nav.canGoBack,
        canGoForward: args.nav.canGoForward,
        canGoToNode: hasNavigableNodes,
        canMoveToNode,
        canGoParent: args.nav.canGoParent,
        canRevealAnswer: args.hasReviewCard && args.isCurrentReviewItemGradable && !args.reviewSession.isAnswerRevealed,
        canToggleReviewMode: args.isStudyMode || args.study.canStartStudyMode,
        canGradeReview: args.hasReviewCard && args.isCurrentReviewItemGradable && args.reviewSession.isAnswerRevealed,
        canDeferReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        canCompleteReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        canDismissReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        isReviewMode: args.isStudyMode
      }).map((item) => ({
        ...item,
        shortcuts: isReviewShortcutCommand(item.id) ? args.hotkeys.shortcutMap[item.id] : item.shortcuts
      })),
    [args, canMoveToNode, hasNavigableNodes]
  );
}
