import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';

type LayoutStateKeys =
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
  | 'onToggleRightSidebarVisibility';

export interface WorkspaceLayoutProps {
  navigation: Pick<WorkspaceLayoutFlatProps,
    | 'activeNodeId'
    | 'canGoBack'
    | 'canGoForward'
    | 'canGoParent'
    | 'onGoBack'
    | 'onGoForward'
    | 'onGoParent'
    | 'onSelectBreadcrumbNode'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
    | 'shouldSuppressNavigationSelectionRestore'
  >;
  document: Pick<WorkspaceLayoutFlatProps,
    | 'contextMenu'
    | 'editorAdapterRef'
    | 'editorContent'
    | 'isEditorReadOnly'
    | 'isPriorityQuickSetActive'
    | 'editorNodeId'
    | 'editorNodeViewState'
    | 'priorityQuickSetShortcutLabel'
    | 'showAnswerSection'
    | 'nodeViewById'
    | 'onAnswerChange'
    | 'onEditorChange'
    | 'onRegisterEditorDraftFlush'
    | 'onNodeContentChange'
    | 'setNodeViewState'
    | 'onEditorReady'
    | 'onEditorContextMenu'
    | 'onNodePriorityChange'
    | 'onNodeDesiredRetentionChange'
    | 'onEnterPriorityQuickSet'
    | 'onRevealAnchorInDocument'
    | 'onPersistPdfViewState'
    | 'onRevealDocumentPosition'
    | 'onRevealDocumentSelection'
    | 'onResolveDocumentPositionAtViewportY'
    | 'onPastedTextAnchors'
  >;
  editorCommands: Pick<WorkspaceLayoutFlatProps,
    | 'onCloseContextMenu'
    | 'onCopyImage'
    | 'onCreateHighlight'
    | 'onCreateNote'
    | 'onDeleteExistingHighlight'
    | 'onOpenExistingHighlight'
    | 'onAdjustExistingHighlightRange'
    | 'onCreateSelectionHighlight'
    | 'onToggleSelectionHighlight'
    | 'onCreateSelectionNote'
    | 'onCreatePdfHighlight'
    | 'onCreateCloze'
    | 'onCreateClozeFromPayload'
    | 'onCreateHighlightFromPayload'
    | 'onCutImage'
    | 'onDeleteImage'
    | 'onExportImage'
  >;
  readingPosition: Pick<WorkspaceLayoutFlatProps,
    | 'beginApplyingReadingPosition'
    | 'completeApplyingReadingPosition'
    | 'getReadingPositionRestoreCommand'
    | 'getReadingPositionSelection'
    | 'getReadingPositionSyncState'
    | 'getReadingPositionTargetViewportMode'
    | 'getReadingPositionTargetViewportRatio'
    | 'setReadingPositionSelection'
  >;
  review: Pick<WorkspaceLayoutFlatProps,
    | 'canStartStudyMode'
    | 'reviewDueCount'
    | 'reviewPreview'
    | 'isStudyMode'
    | 'isAnswerRevealed'
    | 'isCurrentReviewItemGradable'
    | 'isReviewEditing'
    | 'reviewCurrentNodeId'
    | 'reviewPanelQueueNodeIds'
    | 'reviewQueueNodeIds'
    | 'reviewQueueVisibility'
    | 'reviewQueueCount'
    | 'reviewCompletedCount'
    | 'reviewStatus'
    | 'onStartStudyMode'
    | 'onToggleReviewSession'
    | 'onRevealAnswer'
    | 'onGradeReview'
    | 'onCompleteReviewItem'
    | 'onDeferReviewItem'
    | 'onDismissReviewItem'
    | 'onExitReviewMode'
    | 'reviewSchedulerSettings'
  >;
  layoutChrome: Pick<WorkspaceLayoutFlatProps, LayoutStateKeys>;
  imports: Pick<WorkspaceLayoutFlatProps,
    | 'isImportManagementOpen'
    | 'onOpenImportManagement'
    | 'onCloseImportManagement'
    | 'onRunImportFile'
    | 'onRunImportFolder'
    | 'onStartClipboardImport'
  >;
  externalLibrary: Pick<WorkspaceLayoutFlatProps,
    | 'isExternalViewOpen'
    | 'externalFolders'
    | 'externalEntriesByFolderId'
    | 'externalSelection'
    | 'onOpenExternalSelection'
    | 'onOpenExternalLibrarySettings'
    | 'onOpenExternalView'
  >;
  settings: Pick<WorkspaceLayoutFlatProps,
    | 'isSettingsOpen'
    | 'requestedSettingsCategory'
    | 'requestedSettingsDialog'
    | 'onOpenSettings'
    | 'onRunRailAction'
    | 'onCloseSettings'
  >;
  nodeList: Pick<WorkspaceLayoutFlatProps,
    | 'nodeOrder'
    | 'nodesById'
    | 'onOpenNotesView'
    | 'onOpenMoveToNode'
  >;
  trash: Pick<WorkspaceLayoutFlatProps,
    | 'isTrashViewOpen'
    | 'isViewingTrashNode'
    | 'trashedNodeIds'
    | 'onSelectTrashNode'
    | 'onOpenTrashView'
    | 'selectedTrashNodeId'
  >;
  virtualView: Pick<WorkspaceLayoutFlatProps,
    | 'isVirtualViewOpen'
    | 'activeVirtualNodeId'
    | 'onOpenVirtualView'
  >;
}

export function flattenWorkspaceLayoutProps(props: WorkspaceLayoutProps): WorkspaceLayoutFlatProps {
  return {
    ...props.navigation,
    ...props.document,
    ...props.editorCommands,
    ...props.readingPosition,
    ...props.review,
    ...props.layoutChrome,
    ...props.imports,
    ...props.externalLibrary,
    ...props.settings,
    ...props.nodeList,
    ...props.trash,
    ...props.virtualView
  };
}

export function groupWorkspaceLayoutProps(flatProps: WorkspaceLayoutFlatProps): WorkspaceLayoutProps {
  return {
    navigation: flatProps,
    document: flatProps,
    editorCommands: flatProps,
    readingPosition: flatProps,
    review: flatProps,
    layoutChrome: flatProps,
    imports: flatProps,
    externalLibrary: flatProps,
    settings: flatProps,
    nodeList: flatProps,
    trash: flatProps,
    virtualView: flatProps
  };
}
