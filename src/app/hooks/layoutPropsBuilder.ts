import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { isNodeContentLocked } from '../../features/nodes/model/nodeContainers';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import type { ReviewGrade, SchedulerPreviewResult } from '../../features/review/model/reviewTypes';
import type { UnifiedPushQueueRules } from '../../features/review/model/unifiedPushQueueRules';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';
import type { SettingsCategoryId } from '../../features/settings/model/settingsPanelOptions';
import { buildCachedReviewQueuePlan } from '../../store/reviewQueuePlannerCached';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import type { WorkspaceState } from '../../store/workspaceStore';
import { buildReviewQueueVisibility } from '../components/reviewQueueVisibility';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

interface BuildLayoutPropsArgs {
  activeNodeId: string | null;
  isWorkspaceHydrated: boolean;
  reviewSettings: {
    reviewSchedulerSettings: ReviewSchedulerSettings;
  };
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  canStartStudyMode: boolean;
  contextMenu: WorkspaceLayoutProps['contextMenu'];
  documentMaxWidth: number;
  documentNode?: { content: string };
  documentResize: { isResizingDocument: boolean; startResize: WorkspaceLayoutProps['onStartDocumentResize'] };
  editorAdapterRef: { current: EditorAdapter | null };
  editorCtx: Pick<
    WorkspaceLayoutProps,
    | 'onCloseContextMenu'
    | 'onCopyImage'
    | 'onCreateCloze'
    | 'onCreateHighlight'
    | 'onCreateSelectionHighlight'
    | 'onCreateSelectionNote'
    | 'onCreatePdfHighlight'
    | 'onCutImage'
    | 'onDeleteImage'
    | 'onEditorContextMenu'
    | 'onExportImage'
  >;
  editorNodeId: string | null;
  editorNodeViewState: WorkspaceLayoutProps['editorNodeViewState'];
  isResizingList: boolean;
  isResizingRightSidebar: boolean;
  isImportManagementOpen: boolean;
  isImmersiveMode: boolean;
  isPriorityQuickSetActive: boolean;
  isSettingsOpen: boolean;
  requestedSettingsCategory: SettingsCategoryId | null;
  requestedSettingsDialog: 'readwise-reader' | null;
  isStudyMode: boolean;
  isReviewEditing: boolean;
  isListCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  isViewingTrashNode: boolean;
  listWidth: number;
  nowIso: string;
  rightSidebarWidth: number;
  nav: Pick<WorkspaceLayoutProps, 'onGoBack' | 'onGoForward' | 'onGoParent' | 'onSelectBreadcrumbNode' | 'onSelectNode'>;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onNodeDesiredRetentionChange: WorkspaceLayoutProps['onNodeDesiredRetentionChange'];
  onNodePriorityChange: WorkspaceLayoutProps['onNodePriorityChange'];
  onAnswerChange: WorkspaceLayoutProps['onAnswerChange'];
  onEditorChange: WorkspaceLayoutProps['onEditorChange'];
  onEnterPriorityQuickSet: WorkspaceLayoutProps['onEnterPriorityQuickSet'];
  onNodeContentChange: WorkspaceLayoutProps['onNodeContentChange'];
  onEditorReady: WorkspaceLayoutProps['onEditorReady'];
  onOpenNotesView: () => void;
  onOpenMoveToNode: () => void;
  onOpenImportManagement: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onCloseImportManagement: () => void;
  onEnterImmersiveEdit: () => void;
  onEnterImmersiveMode: () => void;
  onExitImmersiveMode: () => void;
  onOpenTrashView: () => void;
  onOpenVirtualView: () => void;
  onResetLayout: () => void;
  onSelectTrashNode: WorkspaceLayoutProps['onSelectTrashNode'];
  onRevealAnchorInDocument: WorkspaceLayoutProps['onRevealAnchorInDocument'];
  onPersistPdfViewState: WorkspaceLayoutProps['onPersistPdfViewState'];
  onRevealDocumentPosition: WorkspaceLayoutProps['onRevealDocumentPosition'];
  onRevealDocumentSelection: WorkspaceLayoutProps['onRevealDocumentSelection'];
  onResolveDocumentPositionAtViewportY: WorkspaceLayoutProps['onResolveDocumentPositionAtViewportY'];
  beginApplyingReadingPosition: WorkspaceLayoutProps['beginApplyingReadingPosition'];
  completeApplyingReadingPosition: WorkspaceLayoutProps['completeApplyingReadingPosition'];
  getReadingPositionSelection: WorkspaceLayoutProps['getReadingPositionSelection'];
  getReadingPositionSyncState: WorkspaceLayoutProps['getReadingPositionSyncState'];
  setReadingPositionSelection: WorkspaceLayoutProps['setReadingPositionSelection'];
  onRightSidebarSplitterKeyDown: WorkspaceLayoutProps['onRightSidebarSplitterKeyDown'];
  onRightSidebarSplitterPointerDown: WorkspaceLayoutProps['onRightSidebarSplitterPointerDown'];
  onSplitterKeyDown: WorkspaceLayoutProps['onSplitterKeyDown'];
  onSplitterPointerDown: WorkspaceLayoutProps['onSplitterPointerDown'];
  onToggleListVisibility: () => void;
  onToggleImmersiveMode: () => void;
  onToggleRightSidebarVisibility: () => void;
  onRunImportFile: WorkspaceLayoutProps['onRunImportFile'];
  onRunImportFolder: WorkspaceLayoutProps['onRunImportFolder'];
  onStartClipboardImport: WorkspaceLayoutProps['onStartClipboardImport'];
  priorityQuickSetShortcutLabel: string;
  reviewDueCount: number;
  reviewPreview: SchedulerPreviewResult | null;
  reviewSession: WorkspaceState['reviewSession'];
  selectedTrashNodeId: string | null;
  showAnswerSection: boolean;
  startStudyMode: () => void;
  startReviewSession: WorkspaceState['startReviewSession'];
  trashedNodeIds: string[];
  exitReviewSession: WorkspaceState['exitReviewSession'];
  exitStudyMode: () => void;
  updateGrade: (grade: ReviewGrade) => Promise<boolean>;
  completeReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  revealReviewAnswer: () => void;
}

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
    pushQueueRules,
    trashedNodeIds
  }).queueNodeIds.length;
}

function createSessionActions(args: BuildLayoutPropsArgs) {
  return {
    onStartStudyMode: () => (args.startReviewSession(), args.startStudyMode()),
    onToggleReviewSession: () =>
      args.isStudyMode
        ? (args.exitReviewSession(), args.exitStudyMode())
        : (args.startReviewSession(), args.startStudyMode())
  };
}

function getReviewSessionSummary(reviewSession: WorkspaceState['reviewSession']) {
  const reviewQueueCount = reviewSession.queueNodeIds.length;
  const reviewCompletedCount = Math.max(reviewSession.totalNodeCount - reviewQueueCount, 0);
  const reviewStatus: WorkspaceLayoutProps['reviewStatus'] = reviewSession.currentNodeId
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
  const activeNode = args.activeNodeId ? args.nodesById[args.activeNodeId] : undefined;
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

  return {
    activeNodeId: args.activeNodeId, isWorkspaceHydrated: args.isWorkspaceHydrated, canGoBack: args.canGoBack, canGoForward: args.canGoForward, canGoParent: args.canGoParent, contextMenu: args.contextMenu,
    documentMaxWidth: args.documentMaxWidth, editorAdapterRef: args.editorAdapterRef, editorContent: args.documentNode?.content ?? '', isImmersiveMode: args.isImmersiveMode, isEditorReadOnly: args.activeNodeId ? !activeNode || !isNodeDocumentLoaded(activeNode) || isNodeContentLocked(args.activeNodeId, args.nodeOrder, args.nodesById, new Set(args.trashedNodeIds)) : false, isPriorityQuickSetActive: args.isPriorityQuickSetActive, editorNodeId: args.editorNodeId, editorNodeViewState: args.editorNodeViewState,
    onNodePriorityChange: args.onNodePriorityChange, onNodeDesiredRetentionChange: args.onNodeDesiredRetentionChange, onEnterPriorityQuickSet: args.onEnterPriorityQuickSet, priorityQuickSetShortcutLabel: args.priorityQuickSetShortcutLabel,
    canStartStudyMode: args.canStartStudyMode, reviewDueCount: args.reviewDueCount, reviewPreview: args.reviewPreview, isStudyMode: args.isStudyMode, isImportManagementOpen: args.isImportManagementOpen, isSettingsOpen: args.isSettingsOpen, requestedSettingsCategory: args.requestedSettingsCategory, requestedSettingsDialog: args.requestedSettingsDialog, isReviewEditing: args.isReviewEditing,
    isAnswerRevealed: args.reviewSession.isAnswerRevealed, isCurrentReviewItemGradable, reviewCurrentNodeId: args.reviewSession.currentNodeId, reviewPanelQueueNodeIds, reviewQueueNodeIds: args.reviewSession.queueNodeIds, reviewQueueVisibility, reviewQueueCount, reviewCompletedCount, reviewStatus, isDocumentResizing: args.documentResize.isResizingDocument, isResizingList: args.isResizingList, isResizingRightSidebar: args.isResizingRightSidebar, isTrashViewOpen: args.isTrashViewOpen, isVirtualViewOpen: args.isVirtualViewOpen, isViewingTrashNode: args.isViewingTrashNode,
    isListCollapsed: args.isListCollapsed, isRightSidebarCollapsed: args.isRightSidebarCollapsed, showAnswerSection: args.showAnswerSection, listWidth: args.listWidth, rightSidebarWidth: args.rightSidebarWidth, nodeOrder: args.nodeOrder, trashedNodeIds: args.trashedNodeIds, nodesById: args.nodesById, onAnswerChange: args.onAnswerChange, onEditorChange: args.onEditorChange, onNodeContentChange: args.onNodeContentChange,
    onEditorReady: args.onEditorReady, onEditorContextMenu: args.editorCtx.onEditorContextMenu, onResetLayout: args.onResetLayout, onSelectBreadcrumbNode: args.nav.onSelectBreadcrumbNode, onSelectNode: args.nav.onSelectNode,
    onRevealAnchorInDocument: args.onRevealAnchorInDocument,
    onPersistPdfViewState: args.onPersistPdfViewState,
    onRevealDocumentPosition: args.onRevealDocumentPosition,
    onRevealDocumentSelection: args.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: args.onResolveDocumentPositionAtViewportY,
    beginApplyingReadingPosition: args.beginApplyingReadingPosition,
    completeApplyingReadingPosition: args.completeApplyingReadingPosition,
    getReadingPositionSelection: args.getReadingPositionSelection,
    getReadingPositionSyncState: args.getReadingPositionSyncState,
    setReadingPositionSelection: args.setReadingPositionSelection,
    onSelectTrashNode: args.onSelectTrashNode, onRightSidebarSplitterKeyDown: args.onRightSidebarSplitterKeyDown, onRightSidebarSplitterPointerDown: args.onRightSidebarSplitterPointerDown, onSplitterKeyDown: args.onSplitterKeyDown, onSplitterPointerDown: args.onSplitterPointerDown, onOpenNotesView: args.onOpenNotesView, onOpenMoveToNode: args.onOpenMoveToNode, onOpenTrashView: args.onOpenTrashView, onOpenVirtualView: args.onOpenVirtualView, onEnterImmersiveEdit: args.onEnterImmersiveEdit, onEnterImmersiveMode: args.onEnterImmersiveMode, onExitImmersiveMode: args.onExitImmersiveMode, onToggleListVisibility: args.onToggleListVisibility,
    onToggleImmersiveMode: args.onToggleImmersiveMode,
    onToggleRightSidebarVisibility: args.onToggleRightSidebarVisibility,
    onOpenImportManagement: args.onOpenImportManagement,
    onCloseImportManagement: args.onCloseImportManagement,
    onRunImportFile: args.onRunImportFile,
    onRunImportFolder: args.onRunImportFolder,
    onStartClipboardImport: args.onStartClipboardImport,
    onGoBack: args.nav.onGoBack, onGoForward: args.nav.onGoForward, onGoParent: args.nav.onGoParent, onCloseContextMenu: args.editorCtx.onCloseContextMenu, onCopyImage: args.editorCtx.onCopyImage, onCreateHighlight: args.editorCtx.onCreateHighlight, onCreateSelectionHighlight: args.editorCtx.onCreateSelectionHighlight, onCreateSelectionNote: args.editorCtx.onCreateSelectionNote, onCreatePdfHighlight: args.editorCtx.onCreatePdfHighlight, onCreateCloze: args.editorCtx.onCreateCloze, onCutImage: args.editorCtx.onCutImage, onDeleteImage: args.editorCtx.onDeleteImage, onExportImage: args.editorCtx.onExportImage,
    onStartDocumentResize: args.documentResize.startResize, onOpenSettings: args.onOpenSettings, onCloseSettings: args.onCloseSettings, ...sessionActions,
    onRevealAnswer: args.revealReviewAnswer, onGradeReview: (grade) => args.updateGrade(grade), onCompleteReviewItem: () => args.completeReviewItem(), onDeferReviewItem: () => args.deferReviewItem(), onDismissReviewItem: () => args.dismissReviewItem(), onExitReviewMode: sessionActions.onToggleReviewSession,
    reviewSchedulerSettings: args.reviewSettings.reviewSchedulerSettings, selectedTrashNodeId: args.selectedTrashNodeId
  };
}
