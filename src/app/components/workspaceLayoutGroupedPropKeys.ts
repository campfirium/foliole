import type {
  WorkspaceLayoutChromeProps,
  WorkspaceLayoutDocumentProps,
  WorkspaceLayoutEditorCommandProps,
  WorkspaceLayoutExternalLibraryProps,
  WorkspaceLayoutFlatProps,
  WorkspaceLayoutImportProps,
  WorkspaceLayoutNavigationProps,
  WorkspaceLayoutNodeListProps,
  WorkspaceLayoutReadingPositionProps,
  WorkspaceLayoutReviewProps,
  WorkspaceLayoutSettingsProps,
  WorkspaceLayoutTrashProps,
  WorkspaceLayoutVirtualViewProps
} from './workspaceLayoutPropGroups';

type ExactKeys<T, K extends readonly (keyof T)[]> =
  Exclude<keyof T, K[number]> extends never ? K : never;

const defineLayoutKeys = <T>() => <const K extends readonly (keyof T)[]>(keys: ExactKeys<T, K>) => keys;

export const NAVIGATION_KEYS = defineLayoutKeys<WorkspaceLayoutNavigationProps>()([
  'activeNodeId', 'canGoBack', 'canGoForward', 'canGoParent', 'onGoBack', 'onGoForward', 'onGoParent',
  'onSelectBreadcrumbNode', 'onSelectNode', 'onSelectNodeInVirtualView', 'shouldSuppressNavigationSelectionRestore'
] as const);

export const DOCUMENT_KEYS = defineLayoutKeys<WorkspaceLayoutDocumentProps>()([
  'contextMenu', 'editorAdapterRef', 'editorContent', 'isEditorReadOnly', 'isPriorityQuickSetActive', 'editorNodeId',
  'editorNodeViewState', 'priorityQuickSetShortcutLabel', 'showAnswerSection', 'nodeViewById', 'onAnswerChange',
  'onEditorChange', 'onEditorUndo', 'onEditorRedo', 'onFinalizeNodeTitle', 'onRegisterEditorDraftFlush',
  'onNodeContentChange', 'setNodeViewState', 'onEditorReady', 'onEditorContextMenu', 'onNodePriorityChange',
  'onNodeDesiredRetentionChange', 'onNodeShortTermChange', 'onEnterPriorityQuickSet', 'onRevealAnchorInDocument',
  'onPersistPdfViewState', 'onRevealDocumentPosition', 'onRevealDocumentSelection', 'onResolveDocumentPositionAtViewportY',
  'onPastedTextAnchors', 'onRunDocumentCommand'
] as const);

export const EDITOR_COMMAND_KEYS = defineLayoutKeys<WorkspaceLayoutEditorCommandProps>()([
  'onCloseContextMenu', 'onCopyImage', 'onCreateHighlight', 'onCreateNote', 'onOpenSelectionNote',
  'onDeleteExistingHighlight', 'onOpenExistingHighlight', 'onRepairTable', 'onAdjustExistingHighlightRange',
  'onCreateSelectionHighlight', 'onToggleSelectionHighlight', 'onCreateSelectionNote', 'onCreatePdfHighlight',
  'onCreateCloze', 'onCreateClozeFromPayload', 'onCreateHighlightFromPayload', 'onCutImage', 'onDeleteImage',
  'onExportImage'
] as const);

export const READING_POSITION_KEYS = defineLayoutKeys<WorkspaceLayoutReadingPositionProps>()([
  'beginApplyingReadingPosition', 'completeApplyingReadingPosition', 'getReadingPositionRestoreCommand',
  'getReadingPositionSelection', 'getReadingPositionSyncState', 'getReadingPositionTargetViewportMode',
  'getReadingPositionTargetViewportRatio', 'setReadingPositionSelection'
] as const);

export const REVIEW_KEYS = defineLayoutKeys<WorkspaceLayoutReviewProps>()([
  'canStartStudyMode', 'reviewPreview', 'isStudyMode', 'isAnswerRevealed', 'isCurrentReviewItemGradable',
  'isReviewEditing', 'reviewCurrentNodeId', 'reviewFlowWindow', 'reviewPanelQueueNodeIds', 'reviewQueueNodeIds',
  'reviewQueueVisibility', 'reviewQueueCount', 'reviewCompletedCount', 'reviewStatus', 'reviewSummary',
  'reviewSessionMode', 'onStartStudyMode', 'onToggleReviewSession', 'onRevealAnswer', 'onGradeReview',
  'onReadReviewTopic', 'onPostponeReviewTopic', 'onOpenPostponeTopicPanel', 'onDismissReviewTopic',
  'onRevisitReviewTopicSoon', 'onContinueReading', 'onResumeReviewItem', 'onExitReviewMode',
  'onSetReviewSessionMode', 'reviewSchedulerSettings'
] as const);

export const LAYOUT_CHROME_KEYS = defineLayoutKeys<WorkspaceLayoutChromeProps>()([
  'isWorkspaceHydrated', 'isImmersiveMode', 'isResizingList', 'isResizingRightSidebar', 'isListCollapsed',
  'isRightSidebarCollapsed', 'listWidth', 'rightSidebarWidth', 'onResetLayout', 'onSplitterKeyDown',
  'onSplitterPointerDown', 'onRightSidebarSplitterKeyDown', 'onRightSidebarSplitterPointerDown',
  'onEnterImmersiveEdit', 'onEnterImmersiveMode', 'onExitImmersiveMode', 'onToggleImmersiveMode',
  'onToggleListVisibility', 'onToggleBothSidebarVisibility', 'onToggleRightSidebarVisibility'
] as const);

export const IMPORT_KEYS = defineLayoutKeys<WorkspaceLayoutImportProps>()([
  'isImportManagementOpen', 'onOpenImportManagement', 'onCloseImportManagement', 'onRunImportFile',
  'onRunImportFolder', 'onStartClipboardImport'
] as const);

export const EXTERNAL_LIBRARY_KEYS = defineLayoutKeys<WorkspaceLayoutExternalLibraryProps>()([
  'isExternalViewOpen', 'externalFolders', 'externalEntriesByFolderId', 'externalSelection',
  'onOpenExternalSelection', 'onOpenExternalLibrarySettings', 'onOpenExternalView',
  'onChangeExternalFolder', 'onRemoveExternalFolder', 'onRescanExternalFolder'
] as const);

export const SETTINGS_KEYS = defineLayoutKeys<WorkspaceLayoutSettingsProps>()([
  'isSettingsOpen', 'requestedSettingsCategory', 'requestedSettingsDialog', 'onOpenSettings', 'onRunRailAction',
  'onCloseSettings'
] as const);

export const NODE_LIST_KEYS = defineLayoutKeys<WorkspaceLayoutNodeListProps>()([
  'browseRootNodeId', 'nodeOrder', 'nodesById', 'onCreateChildNode', 'onOpenNotesView', 'onOpenMoveToNode'
] as const);

export const TRASH_KEYS = defineLayoutKeys<WorkspaceLayoutTrashProps>()([
  'isTrashViewOpen', 'isViewingTrashNode', 'trashedNodeIds', 'onSelectTrashNode', 'onOpenTrashView',
  'selectedTrashNodeId'
] as const);

export const VIRTUAL_VIEW_KEYS = defineLayoutKeys<WorkspaceLayoutVirtualViewProps>()([
  'isVirtualViewOpen', 'activeVirtualNodeId', 'onOpenVirtualView'
] as const);

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
