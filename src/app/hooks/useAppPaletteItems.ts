import { useMemo } from 'react';

import {
  getEditorOperationTopEntry,
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
import { useContentRegionScaleCommandRevision } from '../../shared/commands/contentRegionScaleCommands';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { getWorkspaceRedoTitle, getWorkspaceUndoTitle } from '../../store/workspaceActionHistory';
import { isNodeInSubtree } from '../../store/workspaceNodeTreeOrder';

import { buildAppPaletteItems } from './appCommands';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { resolveDevPaletteOptions } from './appPaletteDevOptions';
import { buildEditorPaletteOptions } from './appPaletteEditorOptions';
import { canDelayReviewTopic } from './appPaletteNodeActionGuards';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useUndoRouterOwner, type UndoRouterOwner } from './undoRouter';

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

export function resolveEditorAwarePaletteHistoryOptions(args: {
  activeNodeId: string | null;
  appActionHistory: Parameters<typeof getWorkspaceUndoTitle>[0];
  editorOperationHistory: Parameters<typeof getEditorOperationUndoTitle>[0];
  owner: UndoRouterOwner;
  t: Translate;
}) {
  const undoEntry = getEditorOperationTopEntry(args.editorOperationHistory, args.activeNodeId, 'undo');
  const redoEntry = getEditorOperationTopEntry(args.editorOperationHistory, args.activeNodeId, 'redo');
  const contentOwner = args.owner === 'content';
  const canUndoEditorOperation = Boolean(undoEntry && (undoEntry.type === 'text.edit' || !undoEntry.applyingMode));
  const canRedoEditorOperation = Boolean(redoEntry && (redoEntry.type === 'text.edit' || !redoEntry.applyingMode));
  return {
    canRedoWorkspaceAction: contentOwner
      ? canRedoEditorOperation
      : !args.appActionHistory.applying && args.appActionHistory.redoStack.length > 0,
    canUndoWorkspaceAction: contentOwner
      ? canUndoEditorOperation
      : !args.appActionHistory.applying && Boolean(
          args.appActionHistory.pendingCreate || args.appActionHistory.undoStack.length > 0
        ),
    redoWorkspaceActionTitle: contentOwner
      ? getEditorOperationRedoTitle(args.editorOperationHistory, args.activeNodeId, args.t)
      : getWorkspaceRedoTitle(args.appActionHistory, args.t),
    undoWorkspaceActionTitle: contentOwner
      ? getEditorOperationUndoTitle(args.editorOperationHistory, args.activeNodeId, args.t)
      : getWorkspaceUndoTitle(args.appActionHistory, args.t)
  };
}

function buildPaletteOptions(
  args: Parameters<typeof useAppPaletteItems>[0],
  canMoveToNode: boolean,
  hasNavigableNodes: boolean,
  owner: UndoRouterOwner,
  t: Translate
) {
  const activeNodeId = args.activeNodeId;
  const reviewNavigationSource = {
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    trashedNodeIds: args.ws.trashedNodeIds
  };
  const historyOptions = resolveEditorAwarePaletteHistoryOptions({
    activeNodeId: args.activeNodeId,
    appActionHistory: args.ws.appActionHistory,
    editorOperationHistory: args.ws.editorOperationHistory,
    owner,
    t
  });
  return {
    ...historyOptions,
    ...buildEditorPaletteOptions(args),
    canImportFile: args.formalImportAvailable,
    canImportFolder: args.formalImportAvailable,
    canRenameNode: Boolean(args.activeNodeId) && !args.isViewingTrashNode,
    canReimportSelectedTopic: canReimportSelectedTopic(args),
    canResetImportData: args.formalImportAvailable,
    ...resolveDevPaletteOptions(),
    canGoBack: args.nav.canGoBack,
    canGoForward: args.nav.canGoForward,
    canGoToLastChild: args.nav.canGoToLastChild,
    canGoToNode: hasNavigableNodes,
    canMoveToNode,
    canGoParent: args.nav.canGoParent,
    canRevealAnswer: args.hasReviewCard && args.isCurrentReviewItemGradable && !args.reviewSession.isAnswerRevealed,
    canToggleReviewMode: args.isStudyMode || args.study.canStartStudyMode,
    canGradeReview: args.hasReviewCard && args.isCurrentReviewItemGradable && args.reviewSession.isAnswerRevealed,
    canSoonReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canPostponeReviewTopic: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canDelayReviewTopic: canDelayReviewTopic(args),
    canReadReviewTopic: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canDismissReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
    canScrollReviewReading: args.isStudyMode && args.hasReviewCard,
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
    isReviewMode: args.isStudyMode, t
  };
}

export function useAppPaletteItems(args: {
  activeNodeId: string | null;
  canScrollCurrentDocument?: boolean;
  formalImportAvailable: boolean;
  hasReviewCard: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isImmersiveMode: boolean;
  isEditorReadOnly: boolean;
  isExternalViewOpen: boolean;
  isFoliolePublishedContext: boolean;
  isViewingTrashNode: boolean;
  isReviewOnly: boolean;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  reviewSession: ReturnType<typeof useWorkspaceSelectors>['reviewSession'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'appActionHistory' | 'editorOperationHistory' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds'>;
}) {
  const contentScaleRevision = useContentRegionScaleCommandRevision();
  const undoRouterOwner = useUndoRouterOwner();
  const t = useTranslation();
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
      buildAppPaletteItems(buildPaletteOptions(args, canMoveToNode, hasNavigableNodes, undoRouterOwner, t)).map((item) => ({
        ...item,
        ...definedProps({ shortcuts: args.hotkeys.shortcutMap[item.id] ?? item.shortcuts })
      })),
    [args, canMoveToNode, contentScaleRevision, hasNavigableNodes, t, undoRouterOwner]
  );
}
