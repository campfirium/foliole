import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { definedProps } from '../../shared/lib/definedProps';
import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from '../../store/workspaceEditorInputDiagnostics';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { buildReviewFlowWindow } from '../../store/workspaceReviewFlowWindow';
import { buildLiveReviewQueueOutput } from '../../store/workspaceReviewLiveQueue';
import { isReviewSessionCompleted } from '../../store/workspaceReviewReading';
import { resolveReviewSessionProgress } from '../../store/workspaceReviewSessionProgress';
import type { WorkspaceState } from '../../store/workspaceStore';
import { buildReviewQueueVisibility } from '../components/reviewQueueVisibility';
import { groupWorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import type { WorkspaceLayoutProps } from '../components/workspaceLayoutGroupedProps';
import type { WorkspaceLayoutFlatProps, WorkspaceLayoutReviewProps } from '../components/workspaceLayoutPropGroups';

import type { BuildLayoutPropsArgs } from './layoutPropsBuilderTypes';
import { enterReviewModeSession } from './reviewModeSessionActions';

const EMPTY_REVIEW_FLOW_WINDOW = Object.freeze({
  dayBuckets: [],
  dayOffsetByNodeId: {},
  queueNodeIds: [],
  readyNodeIds: [],
  upcomingNodeIds: []
});

function measureLayoutPropsStep<T>(args: BuildLayoutPropsArgs, step: string, compute: () => T) {
  if (!isEditorInputDiagnosticEnabled()) {
    return compute();
  }
  const startedAt = readEditorInputDiagnosticTime();
  const result = compute();
  logEditorInputDiagnostic('layout-props-step', {
    activeNodeId: args.activeNodeId,
    nodeCount: args.nodeOrder.length,
    step,
    totalMs: readEditorInputDiagnosticTime() - startedAt
  });
  return result;
}

function createSessionActions(args: BuildLayoutPropsArgs) {
  const exitReviewMode = () => {
    args.exitReviewSession();
    args.exitStudyMode();
    args.onOpenNotesView();
  };
  const enterReviewMode = () =>
    args.reviewSettings.isReviewSchedulerSettingsReady &&
    enterReviewModeSession({
      onReviewQueueEmpty: args.onReviewQueueEmpty,
      onReviewSessionStarted: args.onOpenReviewView,
      startReviewSession: () => args.startReviewSession(args.nowIso),
      startStudyMode: args.startStudyMode
    });
  return {
    onStartStudyMode: enterReviewMode,
    onToggleReviewSession: () => {
      if (!args.isStudyMode) {
        return enterReviewMode();
      }
      exitReviewMode();
      return true;
    },
    onExitReviewMode: exitReviewMode
  };
}

export function countCreatedNodesDuringSession(
  reviewSession: WorkspaceState['reviewSession'],
  nodesById: WorkspaceState['nodesById']
) {
  const startMs = reviewSession.sessionStartedAt ? Date.parse(reviewSession.sessionStartedAt) : NaN;
  const endMs = reviewSession.completedAt ? Date.parse(reviewSession.completedAt) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { createdItemCount: 0, createdTopicCount: 0 };
  }
  let createdItemCount = 0;
  let createdTopicCount = 0;
  for (const node of Object.values(nodesById)) {
    const createdAtMs = Date.parse(node.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= startMs || createdAtMs > endMs) {
      continue;
    }
    if (node.kind === 'item') createdItemCount += 1;
    if (node.kind === 'topic') createdTopicCount += 1;
  }
  return { createdItemCount, createdTopicCount };
}

function getReviewSessionSummary(
  reviewSession: WorkspaceState['reviewSession'],
  nodesById: WorkspaceState['nodesById']
) {
  const { reviewCompletedCount, reviewQueueCount } = resolveReviewSessionProgress(reviewSession);
  const createdCounts = countCreatedNodesDuringSession(reviewSession, nodesById);
  const reviewStatus: WorkspaceLayoutReviewProps['reviewStatus'] = reviewSession.currentNodeId
    ? reviewSession.isAnswerRevealed
      ? 'answer-revealed'
      : 'awaiting-answer'
    : isReviewSessionCompleted(reviewSession)
      ? 'completed'
      : 'idle';
  const reviewSummary: WorkspaceLayoutReviewProps['reviewSummary'] = {
    canContinueReading: false,
    completedAt: reviewSession.completedAt ?? null,
    continueNodeId: reviewSession.continueNodeId ?? null,
    createdItemCount: createdCounts.createdItemCount,
    createdTopicCount: createdCounts.createdTopicCount,
    readingElapsedMs: reviewSession.readingElapsedMs ?? 0,
    readTopicCount: reviewSession.readTopicCount ?? 0,
    reviewElapsedMs: reviewSession.reviewElapsedMs ?? 0,
    reviewedItemCount: reviewSession.reviewedItemCount ?? 0,
    nextReviewDueAt: reviewSession.nextReviewDueAt ?? null,
    sessionStartedAt: reviewSession.sessionStartedAt ?? null
  };
  return { reviewCompletedCount, reviewQueueCount, reviewStatus, reviewSummary };
}

function createContinueReadingAction(args: BuildLayoutPropsArgs) {
  return () => {
    const continueNodeId = args.reviewSession.continueNodeId;
    const targetNodeId =
      continueNodeId && args.nodesById[continueNodeId] && !args.trashedNodeIds.includes(continueNodeId)
        ? continueNodeId
        : args.activeNodeId;
    args.onOpenNotesView();
    if (targetNodeId && args.nodesById[targetNodeId] && !args.trashedNodeIds.includes(targetNodeId)) {
      args.nav.onSelectNode(targetNodeId);
      if (args.continueReviewSessionReading(args.nowIso)) {
        return;
      }
    }
    args.exitReviewSession();
  };
}

function canContinueReadingInFlowWindow(
  reviewSummary: WorkspaceLayoutReviewProps['reviewSummary'],
  reviewFlowWindow: WorkspaceLayoutReviewProps['reviewFlowWindow']
) {
  return Boolean(
    reviewSummary.reviewedItemCount > 0 &&
    reviewSummary.continueNodeId &&
    (
      reviewFlowWindow.queueNodeIds.includes(reviewSummary.continueNodeId) ||
      reviewFlowWindow.readyNodeIds.includes(reviewSummary.continueNodeId)
    )
  );
}

function buildReviewReadyDerivedState(args: BuildLayoutPropsArgs, isReviewReady: boolean) {
  if (!isReviewReady) {
    return {
      reviewFlowWindow: EMPTY_REVIEW_FLOW_WINDOW,
      reviewPanelQueueNodeIds: [],
      reviewQueueVisibility: null
    };
  }
  const reviewPanelQueueNodeIds = measureLayoutPropsStep(args, 'review_panel_queue', () => buildLiveReviewQueueOutput(args, args.nowIso, {
    pinnedNodeId: args.reviewSession.currentNodeId
  }).visibleNodeIds);
  const reviewFlowWindow = measureLayoutPropsStep(args, 'review_flow_window', () => buildReviewFlowWindow(args, args.nowIso, args.reviewSession.queueNodeIds));
  const reviewQueueVisibility = measureLayoutPropsStep(args, 'review_queue_visibility', () => buildReviewQueueVisibility({
    currentNodeId: args.reviewSession.currentNodeId,
    nodesById: args.nodesById,
    queueNodeIds: reviewPanelQueueNodeIds,
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings
  }));
  return { reviewFlowWindow, reviewPanelQueueNodeIds, reviewQueueVisibility };
}

export function buildLayoutProps(args: BuildLayoutPropsArgs): WorkspaceLayoutProps {
  const sessionActions = createSessionActions(args);
  const isReviewReady = args.reviewSettings.isReviewSchedulerSettingsReady;
  const currentReviewNode = args.reviewSession.currentNodeId ? args.nodesById[args.reviewSession.currentNodeId] : undefined;
  const isCurrentReviewItemGradable = getReviewItemKind(currentReviewNode) === 'fsrs';
  const previewNodeId = args.isViewingTrashNode ? args.selectedTrashNodeId : args.activeNodeId;
  const previewNode = previewNodeId ? args.nodesById[previewNodeId] : undefined;
  const { reviewCompletedCount, reviewQueueCount, reviewStatus, reviewSummary } = measureLayoutPropsStep(args, 'review_summary', () =>
    getReviewSessionSummary(args.reviewSession, args.nodesById)
  );
  const { reviewFlowWindow, reviewPanelQueueNodeIds, reviewQueueVisibility } = buildReviewReadyDerivedState(args, isReviewReady);
  const editorContent = args.editorNodeId ? args.nodesById[args.editorNodeId]?.content ?? '' : args.documentNode?.content ?? '';
  const reviewSummaryWithContinuation = {
    ...reviewSummary,
    canContinueReading: canContinueReadingInFlowWindow(reviewSummary, reviewFlowWindow)
  };

  const flatProps: WorkspaceLayoutFlatProps = {
    activeNodeId: args.activeNodeId, browseRootNodeId: args.browseRootNodeId, isWorkspaceHydrated: args.isWorkspaceHydrated, canGoBack: args.canGoBack, canGoForward: args.canGoForward, canGoParent: args.canGoParent, contextMenu: args.contextMenu,
    editorAdapterRef: args.editorAdapterRef, editorContent, isImmersiveMode: args.isImmersiveMode, isEditorReadOnly: args.isViewingTrashNode ? true : previewNodeId ? !previewNode || !isNodeDocumentLoaded(previewNode) : false, isPriorityQuickSetActive: args.isPriorityQuickSetActive, editorNodeId: args.editorNodeId, ...definedProps({ editorNodeViewState: args.editorNodeViewState }),
    onNodePriorityChange: args.onNodePriorityChange, onNodeDesiredRetentionChange: args.onNodeDesiredRetentionChange, onNodeShortTermChange: args.onNodeShortTermChange, onEnterPriorityQuickSet: args.onEnterPriorityQuickSet, priorityQuickSetShortcutLabel: args.priorityQuickSetShortcutLabel,
    canStartStudyMode: isReviewReady && args.canStartStudyMode, reviewPreview: args.reviewPreview, isStudyMode: args.isStudyMode, isImportManagementOpen: args.isImportManagementOpen, isSettingsOpen: args.isSettingsOpen, requestedSettingsCategory: args.requestedSettingsCategory, requestedSettingsDialog: args.requestedSettingsDialog, requestedSettingsRowId: args.requestedSettingsRowId, isReviewEditing: args.isReviewEditing,
    isAnswerRevealed: args.reviewSession.isAnswerRevealed, isCurrentReviewItemGradable, reviewCurrentNodeId: args.reviewSession.currentNodeId, reviewFlowWindow, reviewPanelQueueNodeIds, reviewQueueNodeIds: isReviewReady ? args.reviewSession.queueNodeIds : [], reviewQueueVisibility, reviewQueueCount: isReviewReady ? reviewQueueCount : 0, reviewCompletedCount, reviewStatus, reviewSummary: reviewSummaryWithContinuation, reviewSessionMode: args.reviewSessionMode, isResizingList: args.isResizingList, isResizingRightSidebar: args.isResizingRightSidebar, isTrashViewOpen: args.isTrashViewOpen, isVirtualViewOpen: args.isVirtualViewOpen, isExternalViewOpen: args.isExternalViewOpen, activeVirtualNodeId: args.activeVirtualNodeId, isViewingTrashNode: args.isViewingTrashNode,
    isListCollapsed: args.isListCollapsed, isRightSidebarCollapsed: args.isRightSidebarCollapsed, showAnswerSection: args.showAnswerSection, listWidth: args.listWidth, rightSidebarWidth: args.rightSidebarWidth, nodeOrder: args.nodeOrder, trashedNodeIds: args.trashedNodeIds, nodesById: args.nodesById, externalFolders: args.externalFolders, externalEntriesByFolderId: args.externalEntriesByFolderId, externalSelection: args.externalSelection, nodeViewById: args.nodeViewById, onAnswerChange: args.onAnswerChange, onEditorChange: args.onEditorChange, onEditorUndo: args.onEditorUndo, onEditorRedo: args.onEditorRedo, onFinalizeNodeTitle: args.onFinalizeNodeTitle, onRegisterEditorDraftFlush: args.onRegisterEditorDraftFlush, onNodeContentChange: args.onNodeContentChange, setNodeViewState: args.setNodeViewState,
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
    onSelectTrashNode: args.onSelectTrashNode, onRightSidebarSplitterKeyDown: args.onRightSidebarSplitterKeyDown, onRightSidebarSplitterPointerDown: args.onRightSidebarSplitterPointerDown, onSplitterKeyDown: args.onSplitterKeyDown, onSplitterPointerDown: args.onSplitterPointerDown, onCreateChildNode: args.onCreateChildNode, onOpenNotesView: args.onOpenNotesView, onOpenMoveToNode: args.onOpenMoveToNode, onOpenTrashView: args.onOpenTrashView, onOpenVirtualView: args.onOpenVirtualView, onOpenExternalSelection: args.onOpenExternalSelection, onOpenExternalLibrarySettings: args.onOpenExternalLibrarySettings, onOpenExternalView: args.onOpenExternalView, onChangeExternalFolder: args.onChangeExternalFolder, onRemoveExternalFolder: args.onRemoveExternalFolder, onRescanExternalFolder: args.onRescanExternalFolder, onEnterImmersiveEdit: args.onEnterImmersiveEdit, onEnterImmersiveMode: args.onEnterImmersiveMode, onExitImmersiveMode: args.onExitImmersiveMode, onToggleListVisibility: args.onToggleListVisibility, onToggleBothSidebarVisibility: args.onToggleBothSidebarVisibility,
    onToggleImmersiveMode: args.onToggleImmersiveMode,
    onToggleRightSidebarVisibility: args.onToggleRightSidebarVisibility,
    onOpenImportManagement: args.onOpenImportManagement,
    onCloseImportManagement: args.onCloseImportManagement,
    onRunImportFile: args.onRunImportFile,
    onRunImportFolder: args.onRunImportFolder,
    onStartClipboardImport: args.onStartClipboardImport,
    onGoBack: args.nav.onGoBack, onGoForward: args.nav.onGoForward, onGoParent: args.nav.onGoParent, onCloseContextMenu: args.editorCtx.onCloseContextMenu, onCopyImage: args.editorCtx.onCopyImage, onCreateHighlight: args.editorCtx.onCreateHighlight, onCreateNote: args.editorCtx.onCreateNote, onOpenSelectionNote: args.editorCtx.onOpenSelectionNote, onDeleteExistingHighlight: args.editorCtx.onDeleteExistingHighlight, onOpenExistingHighlight: args.editorCtx.onOpenExistingHighlight, onRepairTable: args.editorCtx.onRepairTable, onAdjustExistingHighlightRange: args.editorCtx.onAdjustExistingHighlightRange, onCreateSelectionHighlight: args.editorCtx.onCreateSelectionHighlight, onToggleSelectionHighlight: args.editorCtx.onToggleSelectionHighlight, onCreateSelectionNote: args.editorCtx.onCreateSelectionNote, onCreatePdfHighlight: args.editorCtx.onCreatePdfHighlight, onCreateCloze: args.editorCtx.onCreateCloze, onCutImage: args.editorCtx.onCutImage, onDeleteImage: args.editorCtx.onDeleteImage, onExportImage: args.editorCtx.onExportImage, ...definedProps({ onCreateHighlightFromPayload: args.editorCtx.onCreateHighlightFromPayload, onPastedTextAnchors: args.onPastedTextAnchors, onCreateClozeFromPayload: args.editorCtx.onCreateClozeFromPayload }),
    onOpenSettings: args.onOpenSettings, onCloseSettings: args.onCloseSettings, ...sessionActions,
    onRevealAnswer: args.revealReviewAnswer, onResumeReviewItem: args.onResumeReviewItem, onGradeReview: (grade) => args.updateGrade(grade), onReadReviewTopic: (options) => args.readReviewTopic(undefined, options), onPostponeReviewTopic: () => args.postponeReviewTopic(), onOpenPostponeTopicPanel: args.onOpenPostponeTopicPanel, onDismissReviewTopic: () => args.dismissReviewTopic(), onRevisitReviewTopicSoon: () => args.revisitReviewTopicSoon(), onContinueReading: createContinueReadingAction(args), onExitReviewMode: sessionActions.onExitReviewMode, onSetReviewSessionMode: (mode) => args.setReviewSessionMode(mode, args.nowIso),
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings, selectedTrashNodeId: args.selectedTrashNodeId
  };
  return measureLayoutPropsStep(args, 'group_workspace_layout_props', () => groupWorkspaceLayoutProps(flatProps));
}
