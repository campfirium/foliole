import { useMemo } from 'react';

import { canNodeAcceptMovedChildren } from '../../features/nodes/model/nodeContainers';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import { isNodeInSubtree } from '../../store/workspaceNodeTreeOrder';

import { buildAppPaletteItems } from './appCommands';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { useCommandShortcutState } from './reviewHotkeysState';

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
    args.activeNodeId,
    new Set(args.ws.trashedNodeIds)
  );
}

function canExportCurrentArticle(args: {
  activeNodeId: string | null;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId)) {
    return false;
  }
  const activeNode = args.ws.nodesById[args.activeNodeId];
  if (!activeNode || activeNode.kind === 'folder') {
    return false;
  }
  if (activeNode.kind === 'topic' && !activeNode.anchorLink) {
    return true;
  }
  return Boolean(activeNode.parentNodeId);
}

function canMergeHighlightsIntoTopic(args: {
  activeNodeId: string | null;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId)) {
    return false;
  }
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return Boolean(activeNode && activeNode.kind === 'topic' && !activeNode.anchorLink);
}

function canReimportSelectedTopic(args: {
  activeNodeId: string | null;
  formalImportAvailable: boolean;
  isViewingTrashNode: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!import.meta.env.DEV || !args.formalImportAvailable || args.isViewingTrashNode || !args.activeNodeId) {
    return false;
  }
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return Boolean(activeNode && activeNode.kind === 'topic' && !activeNode.anchorLink && !args.ws.trashedNodeIds.includes(args.activeNodeId));
}

function canToggleImmersiveMode(args: {
  activeNodeId: string | null;
  isStudyMode: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!args.activeNodeId || args.ws.trashedNodeIds.includes(args.activeNodeId) || args.isStudyMode) {
    return false;
  }
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return Boolean(activeNode && activeNode.kind !== 'folder');
}

function buildPaletteOptions(
  args: Parameters<typeof useAppPaletteItems>[0],
  canMoveToNode: boolean,
  hasNavigableNodes: boolean
) {
  const canUseCurrentTopic = canMergeHighlightsIntoTopic(args);
  return {
    canExportCurrentArticle: canExportCurrentArticle(args),
    canImportFile: args.formalImportAvailable,
    canImportFolder: args.formalImportAvailable,
    canMergeHighlightsIntoTopic: canUseCurrentTopic,
    canRenameNode: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canReimportSelectedTopic: canReimportSelectedTopic(args),
    canResetImportData: args.formalImportAvailable,
    canGoBack: args.nav.canGoBack,
    canGoForward: args.nav.canGoForward,
    canGoToNode: hasNavigableNodes,
    canMoveToNode,
    canGoParent: args.nav.canGoParent,
    canFindInCurrentTopic: canUseCurrentTopic,
    canToggleImmersiveMode: canToggleImmersiveMode(args),
    canSetNodePriority: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canRevealAnswer: args.hasReviewCard && args.isCurrentReviewItemGradable && !args.reviewSession.isAnswerRevealed,
    canToggleReviewMode: args.isStudyMode || args.study.canStartStudyMode,
    canGradeReview: args.hasReviewCard && args.isCurrentReviewItemGradable && args.reviewSession.isAnswerRevealed,
    canDeferReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canCompleteReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canDismissReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    isImmersiveMode: args.isImmersiveMode,
    isReviewMode: args.isStudyMode
  };
}

export function useAppPaletteItems(args: {
  activeNodeId: string | null;
  formalImportAvailable: boolean;
  hasReviewCard: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isImmersiveMode: boolean;
  resolvedBaseColorMode: 'dark' | 'light';
  isViewingTrashNode: boolean;
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
      return Boolean(
        activeNodeId &&
        canNodeBeMoved(args.ws.nodesById[activeNodeId]) &&
        args.ws.nodeOrder.some((nodeId) => canNodeBeMoveTarget({ activeNodeId, nodeId, ws: args.ws }))
      );
    },
    [args.activeNodeId, args.ws.nodeOrder, args.ws.nodesById, args.ws.trashedNodeIds]
  );

  return useMemo(
    () =>
      buildAppPaletteItems(buildPaletteOptions(args, canMoveToNode, hasNavigableNodes)).map((item) => ({
        ...item,
        shortcuts: args.hotkeys.shortcutMap[item.id] ?? item.shortcuts
      })),
    [args, canMoveToNode, hasNavigableNodes]
  );
}
