import { isNodeContentLocked } from '../../features/nodes/model/nodeContainers';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import type { UnifiedPushQueueRules } from '../../features/review/model/unifiedPushQueueRules';
import { definedProps } from '../../shared/lib/definedProps';
import { buildCachedReviewQueuePlan } from '../../store/reviewQueuePlannerCached';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import type { WorkspaceState } from '../../store/workspaceStore';
import { buildReviewQueueVisibility } from '../components/reviewQueueVisibility';
import { groupWorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import type { WorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import type { WorkspaceLayoutFlatProps } from '../components/workspaceLayoutProps';

import type { BuildLayoutPropsArgs } from './layoutPropsBuilderTypes';
import { enterReviewModeSession } from './reviewModeSessionActions';

export function countDueReviewNodes(
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: string[],
  now: string,
  pushQueueRules?: UnifiedPushQueueRules
) {
  return buildCachedReviewQueuePlan({
    nodeOrder,
    nodesById,
    now,
    trashedNodeIds,
    ...definedProps({ pushQueueRules })
  }).queueNodeIds.length;
}

function createSessionActions(args: BuildLayoutPropsArgs) {
  const enterReviewMode = () =>
    enterReviewModeSession({
      onReviewSessionStarted: args.onOpenNotesView,
      startReviewSession: args.startReviewSession,
      startStudyMode: args.startStudyMode
    });
  return {
    onStartStudyMode: enterReviewMode,
    onToggleReviewSession: () =>
      args.isStudyMode
        ? (args.exitReviewSession(), args.exitStudyMode())
        : enterReviewMode()
  };
}

function getReviewSessionSummary(reviewSession: WorkspaceState['reviewSession']) {
  const reviewQueueCount = reviewSession.queueNodeIds.length;
  const reviewCompletedCount = Math.max(reviewSession.totalNodeCount - reviewQueueCount, 0);
  const reviewStatus: WorkspaceLayoutFlatProps['reviewStatus'] = reviewSession.currentNodeId
    ? reviewSession.isAnswerRevealed
      ? 'answer-revealed'
      : 'awaiting-answer'
    : 'completed';
  return { reviewCompletedCount, reviewQueueCount, reviewStatus };
}

export function buildLayoutProps(args: BuildLayoutPropsArgs): WorkspaceLayoutProps {
  const sessionActions = createSessionActions(args);
  const currentReviewNode = args.reviewSession.currentNodeId ? args.nodesById[args.reviewSession.currentNodeId] : undefined;
  const isCurrentReviewItemGradable = getReviewItemKind(currentReviewNode) === 'fsrs';
  const previewNodeId = args.isViewingTrashNode ? args.selectedTrashNodeId : args.activeNodeId;
  const previewNode = previewNodeId ? args.nodesById[previewNodeId] : undefined;
  const { reviewCompletedCount, reviewQueueCount, reviewStatus } = getReviewSessionSummary(
    args.reviewSession
  );
  const reviewQueueVisibility = buildReviewQueueVisibility({
    currentNodeId: args.reviewSession.currentNodeId,
    nodesById: args.nodesById,
    queueNodeIds: args.reviewSession.queueNodeIds,
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings
  });
  const reviewPanelQueueNodeIds = buildCachedReviewQueuePlan({
    includeScheduled: true,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.nowIso,
    pushQueueRules: args.reviewSettings.reviewSchedulerSettings.pushQueue,
    trashedNodeIds: args.trashedNodeIds
  }).queueNodeIds;

  const flatProps: WorkspaceLayoutFlatProps = {
    activeNodeId: args.activeNodeId, isWorkspaceHydrated: args.isWorkspaceHydrated, canGoBack: args.canGoBack, canGoForward: args.canGoForward, canGoParent: args.canGoParent, contextMenu: args.contextMenu,
    editorAdapterRef: args.editorAdapterRef, editorContent: args.documentNode?.content ?? '', isImmersiveMode: args.isImmersiveMode, isEditorReadOnly: args.isViewingTrashNode ? true : previewNodeId ? !previewNode || !isNodeDocumentLoaded(previewNode) || isNodeContentLocked(previewNodeId, args.nodeOrder, args.nodesById, new Set(args.trashedNodeIds)) : false, isPriorityQuickSetActive: args.isPriorityQuickSetActive, editorNodeId: args.editorNodeId, ...definedProps({ editorNodeViewState: args.editorNodeViewState }),
    onNodePriorityChange: args.onNodePriorityChange, onNodeDesiredRetentionChange: args.onNodeDesiredRetentionChange, onEnterPriorityQuickSet: args.onEnterPriorityQuickSet, priorityQuickSetShortcutLabel: args.priorityQuickSetShortcutLabel,
    canStartStudyMode: args.canStartStudyMode, reviewDueCount: args.reviewDueCount, reviewPreview: args.reviewPreview, isStudyMode: args.isStudyMode, isImportManagementOpen: args.isImportManagementOpen, isSettingsOpen: args.isSettingsOpen, requestedSettingsCategory: args.requestedSettingsCategory, requestedSettingsDialog: args.requestedSettingsDialog, isReviewEditing: args.isReviewEditing,
    isAnswerRevealed: args.reviewSession.isAnswerRevealed, isCurrentReviewItemGradable, reviewCurrentNodeId: args.reviewSession.currentNodeId, reviewPanelQueueNodeIds, reviewQueueNodeIds: args.reviewSession.queueNodeIds, reviewQueueVisibility, reviewQueueCount, reviewCompletedCount, reviewStatus, isResizingList: args.isResizingList, isResizingRightSidebar: args.isResizingRightSidebar, isTrashViewOpen: args.isTrashViewOpen, isVirtualViewOpen: args.isVirtualViewOpen, isExternalViewOpen: args.isExternalViewOpen, activeVirtualNodeId: args.activeVirtualNodeId, isViewingTrashNode: args.isViewingTrashNode,
    isListCollapsed: args.isListCollapsed, isRightSidebarCollapsed: args.isRightSidebarCollapsed, showAnswerSection: args.showAnswerSection, listWidth: args.listWidth, rightSidebarWidth: args.rightSidebarWidth, nodeOrder: args.nodeOrder, trashedNodeIds: args.trashedNodeIds, nodesById: args.nodesById, externalFolders: args.externalFolders, externalEntriesByFolderId: args.externalEntriesByFolderId, externalSelection: args.externalSelection, nodeViewById: args.nodeViewById, onAnswerChange: args.onAnswerChange, onEditorChange: args.onEditorChange, onRegisterEditorDraftFlush: args.onRegisterEditorDraftFlush, onNodeContentChange: args.onNodeContentChange, setNodeViewState: args.setNodeViewState,
    onEditorReady: args.onEditorReady, onEditorContextMenu: args.editorCtx.onEditorContextMenu, onResetLayout: args.onResetLayout, onSelectBreadcrumbNode: args.nav.onSelectBreadcrumbNode, onSelectNode: args.nav.onSelectNode, onSelectNodeInVirtualView: args.nav.onSelectNodeInVirtualView, shouldSuppressNavigationSelectionRestore: args.nav.shouldSuppressNavigationSelectionRestore,
    onRevealAnchorInDocument: args.onRevealAnchorInDocument,
    onPersistPdfViewState: args.onPersistPdfViewState,
    onRevealDocumentPosition: args.onRevealDocumentPosition,
    onRevealDocumentSelection: args.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: args.onResolveDocumentPositionAtViewportY,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    getReadingPositionRestoreCommand: args.getReadingPositionRestoreCommand,
    getReadingPositionSelection: args.getReadingPositionSelection,
    getReadingPositionSyncState: args.getReadingPositionSyncState,
    getReadingPositionTargetViewportMode: args.getReadingPositionTargetViewportMode,
    getReadingPositionTargetViewportRatio: args.getReadingPositionTargetViewportRatio,
    setReadingPositionSelection: args.setReadingPositionSelection,
    onSelectTrashNode: args.onSelectTrashNode, onRightSidebarSplitterKeyDown: args.onRightSidebarSplitterKeyDown, onRightSidebarSplitterPointerDown: args.onRightSidebarSplitterPointerDown, onSplitterKeyDown: args.onSplitterKeyDown, onSplitterPointerDown: args.onSplitterPointerDown, onOpenNotesView: args.onOpenNotesView, onOpenMoveToNode: args.onOpenMoveToNode, onOpenTrashView: args.onOpenTrashView, onOpenVirtualView: args.onOpenVirtualView, onOpenExternalSelection: args.onOpenExternalSelection, onOpenExternalLibrarySettings: args.onOpenExternalLibrarySettings, onOpenExternalView: args.onOpenExternalView, onEnterImmersiveEdit: args.onEnterImmersiveEdit, onEnterImmersiveMode: args.onEnterImmersiveMode, onExitImmersiveMode: args.onExitImmersiveMode, onToggleListVisibility: args.onToggleListVisibility,
    onToggleImmersiveMode: args.onToggleImmersiveMode,
    onToggleRightSidebarVisibility: args.onToggleRightSidebarVisibility,
    onOpenImportManagement: args.onOpenImportManagement,
    onCloseImportManagement: args.onCloseImportManagement,
    onRunImportFile: args.onRunImportFile,
    onRunImportFolder: args.onRunImportFolder,
    onStartClipboardImport: args.onStartClipboardImport,
    onGoBack: args.nav.onGoBack, onGoForward: args.nav.onGoForward, onGoParent: args.nav.onGoParent, onCloseContextMenu: args.editorCtx.onCloseContextMenu, onCopyImage: args.editorCtx.onCopyImage, onCreateHighlight: args.editorCtx.onCreateHighlight, onCreateNote: args.editorCtx.onCreateNote, onOpenSelectionNote: args.editorCtx.onOpenSelectionNote, onDeleteExistingHighlight: args.editorCtx.onDeleteExistingHighlight, onOpenExistingHighlight: args.editorCtx.onOpenExistingHighlight, onRepairTable: args.editorCtx.onRepairTable, onAdjustExistingHighlightRange: args.editorCtx.onAdjustExistingHighlightRange, onCreateSelectionHighlight: args.editorCtx.onCreateSelectionHighlight, onToggleSelectionHighlight: args.editorCtx.onToggleSelectionHighlight, onCreateSelectionNote: args.editorCtx.onCreateSelectionNote, onCreatePdfHighlight: args.editorCtx.onCreatePdfHighlight, onCreateCloze: args.editorCtx.onCreateCloze, onCutImage: args.editorCtx.onCutImage, onDeleteImage: args.editorCtx.onDeleteImage, onExportImage: args.editorCtx.onExportImage, ...definedProps({ onCreateHighlightFromPayload: args.editorCtx.onCreateHighlightFromPayload, onPastedTextAnchors: args.onPastedTextAnchors, onCreateClozeFromPayload: args.editorCtx.onCreateClozeFromPayload }),
    onOpenSettings: args.onOpenSettings, onCloseSettings: args.onCloseSettings, ...sessionActions,
    onRevealAnswer: args.revealReviewAnswer, onGradeReview: (grade) => args.updateGrade(grade), onCompleteReviewItem: () => args.completeReviewItem(), onDeferReviewItem: () => args.deferReviewItem(), onDismissReviewItem: () => args.dismissReviewItem(), onExitReviewMode: sessionActions.onToggleReviewSession,
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings, selectedTrashNodeId: args.selectedTrashNodeId
  };
  return groupWorkspaceLayoutProps(flatProps);
}
