import { useMemo } from 'react';

import {
  canApplyEditorOperationEntryForCurrentNode,
  getEditorOperationRedoTitle,
  getEditorOperationUndoTitle
} from '../../features/editor/model/editorOperationHistory';
import { canNodeAcceptMovedChildren } from '../../features/nodes/model/nodeContainers';
import { canNodeBeMoved } from '../../features/nodes/model/nodeMovementRules';
import {
  resolveReviewFirstChildNodeId,
  resolveReviewSiblingNodeId,
  resolveReviewSourceTopicNodeId
} from '../../features/review/model/reviewGameNavigation';
import { definedProps } from '../../shared/lib/definedProps';
import { getWorkspaceRedoTitle, getWorkspaceUndoTitle } from '../../store/workspaceActionHistory';
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
  return Boolean(activeNode && activeNode.kind !== 'folder' && !args.ws.trashedNodeIds.includes(args.activeNodeId));
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

function canAnnotateSelection(args: {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  if (!args.activeNodeId || args.isViewingTrashNode || args.ws.trashedNodeIds.includes(args.activeNodeId)) {
    return false;
  }
  return args.ws.nodesById[args.activeNodeId]?.kind !== 'folder';
}

export function resolveEditorAwarePaletteHistoryOptions(args: {
  activeNodeId: string | null;
  appActionHistory: Parameters<typeof getWorkspaceUndoTitle>[0];
  editorOperationHistory: Parameters<typeof getEditorOperationUndoTitle>[0];
}) {
  const canUndoEditorOperation = canApplyEditorOperationEntryForCurrentNode(args.editorOperationHistory.undoStack.at(-1), args.activeNodeId);
  const canRedoEditorOperation = canApplyEditorOperationEntryForCurrentNode(args.editorOperationHistory.redoStack.at(-1), args.activeNodeId);
  return {
    canRedoWorkspaceAction: canRedoEditorOperation || args.appActionHistory.redoStack.length > 0,
    canUndoWorkspaceAction: canUndoEditorOperation || args.appActionHistory.undoStack.length > 0,
    redoWorkspaceActionTitle: canRedoEditorOperation
      ? getEditorOperationRedoTitle(args.editorOperationHistory)
      : getWorkspaceRedoTitle(args.appActionHistory),
    undoWorkspaceActionTitle: canUndoEditorOperation
      ? getEditorOperationUndoTitle(args.editorOperationHistory)
      : getWorkspaceUndoTitle(args.appActionHistory)
  };
}

function buildPaletteOptions(
  args: Parameters<typeof useAppPaletteItems>[0],
  canMoveToNode: boolean,
  hasNavigableNodes: boolean
) {
  const canUseCurrentTopic = canMergeHighlightsIntoTopic(args);
  const activeNodeId = args.activeNodeId;
  const reviewNavigationSource = {
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    trashedNodeIds: args.ws.trashedNodeIds
  };
  const historyOptions = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: args.activeNodeId,
    appActionHistory: args.ws.appActionHistory,
    editorOperationHistory: args.ws.editorOperationHistory
  });
  return {
    ...historyOptions,
    canExportCurrentArticle: canExportCurrentArticle(args),
    canAnnotateSelection: canAnnotateSelection(args),
    canImportFile: args.formalImportAvailable,
    canImportFolder: args.formalImportAvailable,
    canMergeHighlightsIntoTopic: canUseCurrentTopic,
    canRepairTable: canAnnotateSelection(args),
    canRenameNode: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canReimportSelectedTopic: canReimportSelectedTopic(args),
    canResetImportData: args.formalImportAvailable,
    canToggleDevReviewStatusBarPersistence: import.meta.env.DEV,
    canGoBack: args.nav.canGoBack,
    canGoForward: args.nav.canGoForward,
    canGoToNode: hasNavigableNodes,
    canMoveToNode,
    canGoParent: args.nav.canGoParent,
    canFindInCurrentTopic: canUseCurrentTopic,
    canToggleImmersiveMode: canToggleImmersiveMode(args),
    canSetNodePriority: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canRevealAnswer: args.hasReviewCard && args.isCurrentReviewItemGradable && !args.reviewSession.isAnswerRevealed,
    canToggleReviewMode: args.isStudyMode || args.study.canStartStudyMode || args.reviewDueCount > 0,
    canGradeReview: args.hasReviewCard && args.isCurrentReviewItemGradable && args.reviewSession.isAnswerRevealed,
    canSoonReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canPostponeReviewTopic: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canReadReviewTopic: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canDismissReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canDeleteReviewItem: args.hasReviewCard,
    canReviewNavigateParent: Boolean(args.isStudyMode && activeNodeId && args.ws.nodesById[activeNodeId]?.parentNodeId),
    canReviewNavigateBack: args.isStudyMode && args.nav.canGoBack,
    canReviewNavigateForward: args.isStudyMode && args.nav.canGoForward,
    canReviewNavigateDown: Boolean(args.isStudyMode && activeNodeId && resolveReviewFirstChildNodeId(activeNodeId, reviewNavigationSource)),
    canReviewNavigatePreviousSibling: Boolean(args.isStudyMode && activeNodeId && resolveReviewSiblingNodeId(activeNodeId, -1, reviewNavigationSource)),
    canReviewNavigateNextSibling: Boolean(args.isStudyMode && activeNodeId && resolveReviewSiblingNodeId(activeNodeId, 1, reviewNavigationSource)),
    canDeleteReviewSourceTopic: Boolean(args.isStudyMode && activeNodeId && resolveReviewSourceTopicNodeId(activeNodeId, reviewNavigationSource)),
    isImmersiveMode: args.isImmersiveMode,
    isDevReviewStatusBarPersistenceEnabled: args.study.isDevReviewStatusBarPersistenceEnabled,
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
  reviewDueCount: number;
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'appActionHistory' | 'editorOperationHistory' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>;
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
        ...definedProps({ shortcuts: args.hotkeys.shortcutMap[item.id] ?? item.shortcuts })
      })),
    [args, canMoveToNode, hasNavigableNodes]
  );
}
