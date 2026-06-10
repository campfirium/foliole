import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';

export type LayoutStateKeys =
  | 'isWorkspaceHydrated'
  | 'isImmersiveMode'
  | 'isResizingList'
  | 'isResizingRightSidebar'
  | 'isListCollapsed'
  | 'isRightSidebarCollapsed'
  | 'listWidth'
  | 'rightSidebarWidth'
  | 'onResetLayout'
  | 'onSplitterKeyDown'
  | 'onSplitterPointerDown'
  | 'onRightSidebarSplitterKeyDown'
  | 'onRightSidebarSplitterPointerDown'
  | 'onEnterImmersiveEdit'
  | 'onEnterImmersiveMode'
  | 'onExitImmersiveMode'
  | 'onToggleImmersiveMode'
  | 'onToggleListVisibility'
  | 'onToggleBothSidebarVisibility'
  | 'onToggleRightSidebarVisibility';

export const NAVIGATION_KEYS = [
  'activeNodeId', 'canGoBack', 'canGoForward', 'canGoParent', 'onGoBack', 'onGoForward', 'onGoParent',
  'onSelectBreadcrumbNode', 'onSelectNode', 'onSelectNodeInVirtualView', 'shouldSuppressNavigationSelectionRestore'
] as const;

export const DOCUMENT_KEYS = [
  'contextMenu', 'editorAdapterRef', 'editorContent', 'isEditorReadOnly', 'isPriorityQuickSetActive', 'editorNodeId',
  'editorNodeViewState', 'priorityQuickSetShortcutLabel', 'showAnswerSection', 'nodeViewById', 'onAnswerChange',
  'onEditorChange', 'onEditorUndo', 'onEditorRedo', 'onFinalizeNodeTitle', 'onRegisterEditorDraftFlush',
  'onNodeContentChange', 'setNodeViewState', 'onEditorReady', 'onEditorContextMenu', 'onNodePriorityChange',
  'onNodeDesiredRetentionChange', 'onNodeShortTermChange', 'onEnterPriorityQuickSet', 'onRevealAnchorInDocument',
  'onPersistPdfViewState', 'onRevealDocumentPosition', 'onRevealDocumentSelection', 'onResolveDocumentPositionAtViewportY',
  'onPastedTextAnchors'
] as const;

export const EDITOR_COMMAND_KEYS = [
  'onCloseContextMenu', 'onCopyImage', 'onCreateHighlight', 'onCreateNote', 'onOpenSelectionNote',
  'onDeleteExistingHighlight', 'onOpenExistingHighlight', 'onRepairTable', 'onAdjustExistingHighlightRange',
  'onCreateSelectionHighlight', 'onToggleSelectionHighlight', 'onCreateSelectionNote', 'onCreatePdfHighlight',
  'onCreateCloze', 'onCreateClozeFromPayload', 'onCreateHighlightFromPayload', 'onCutImage', 'onDeleteImage',
  'onExportImage'
] as const;

export const READING_POSITION_KEYS = [
  'beginApplyingReadingPosition', 'completeApplyingReadingPosition', 'getReadingPositionRestoreCommand',
  'getReadingPositionSelection', 'getReadingPositionSyncState', 'getReadingPositionTargetViewportMode',
  'getReadingPositionTargetViewportRatio', 'setReadingPositionSelection'
] as const;

export const REVIEW_KEYS = [
  'canStartStudyMode', 'reviewPreview', 'isStudyMode', 'isAnswerRevealed', 'isCurrentReviewItemGradable',
  'isReviewEditing', 'reviewCurrentNodeId', 'reviewFlowWindow', 'reviewPanelQueueNodeIds', 'reviewQueueNodeIds',
  'reviewQueueVisibility', 'reviewQueueCount', 'reviewCompletedCount', 'reviewStatus', 'reviewSummary',
  'reviewSessionMode', 'onStartStudyMode', 'onToggleReviewSession', 'onRevealAnswer', 'onGradeReview',
  'onReadReviewTopic', 'onPostponeReviewTopic', 'onOpenPostponeTopicPanel', 'onDismissReviewTopic',
  'onRevisitReviewTopicSoon', 'onContinueReading', 'onResumeReviewItem', 'onExitReviewMode',
  'onSetReviewSessionMode', 'reviewSchedulerSettings'
] as const;

export const LAYOUT_CHROME_KEYS = [
  'isWorkspaceHydrated', 'isImmersiveMode', 'isResizingList', 'isResizingRightSidebar', 'isListCollapsed',
  'isRightSidebarCollapsed', 'listWidth', 'rightSidebarWidth', 'onResetLayout', 'onSplitterKeyDown',
  'onSplitterPointerDown', 'onRightSidebarSplitterKeyDown', 'onRightSidebarSplitterPointerDown',
  'onEnterImmersiveEdit', 'onEnterImmersiveMode', 'onExitImmersiveMode', 'onToggleImmersiveMode',
  'onToggleListVisibility', 'onToggleBothSidebarVisibility', 'onToggleRightSidebarVisibility'
] as const;

export const IMPORT_KEYS = [
  'isImportManagementOpen', 'onOpenImportManagement', 'onCloseImportManagement', 'onRunImportFile',
  'onRunImportFolder', 'onStartClipboardImport'
] as const;

export const EXTERNAL_LIBRARY_KEYS = [
  'isExternalViewOpen', 'externalFolders', 'externalEntriesByFolderId', 'externalSelection',
  'onOpenExternalSelection', 'onOpenExternalLibrarySettings', 'onOpenExternalView'
] as const;

export const SETTINGS_KEYS = [
  'isSettingsOpen', 'requestedSettingsCategory', 'requestedSettingsDialog', 'onOpenSettings', 'onRunRailAction',
  'onCloseSettings'
] as const;

export const NODE_LIST_KEYS = [
  'nodeOrder', 'nodesById', 'onOpenNotesView', 'onOpenMoveToNode'
] as const;

export const TRASH_KEYS = [
  'isTrashViewOpen', 'isViewingTrashNode', 'trashedNodeIds', 'onSelectTrashNode', 'onOpenTrashView',
  'selectedTrashNodeId'
] as const;

export const VIRTUAL_VIEW_KEYS = [
  'isVirtualViewOpen', 'activeVirtualNodeId', 'onOpenVirtualView'
] as const;

export function pickLayoutProps<K extends keyof WorkspaceLayoutFlatProps>(
  flatProps: WorkspaceLayoutFlatProps,
  keys: readonly K[]
): Pick<WorkspaceLayoutFlatProps, K> {
  const result = {} as Pick<WorkspaceLayoutFlatProps, K>;
  for (const key of keys) {
    result[key] = flatProps[key];
  }
  return result;
}
