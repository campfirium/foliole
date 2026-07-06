import type { WorkspaceLayoutFieldTypes } from './workspaceLayoutProps';

export type WorkspaceLayoutNavigationProps = Pick<WorkspaceLayoutFieldTypes,
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

export type WorkspaceLayoutDocumentProps = Pick<WorkspaceLayoutFieldTypes,
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
  | 'onEditorUndo'
  | 'onEditorRedo'
  | 'onFinalizeNodeTitle'
  | 'onRegisterEditorDraftFlush'
  | 'onNodeContentChange'
  | 'setNodeViewState'
  | 'onEditorReady'
  | 'onEditorContextMenu'
  | 'onNodePriorityChange'
  | 'onNodeDesiredRetentionChange'
  | 'onNodeShortTermChange'
  | 'onEnterPriorityQuickSet'
  | 'onRevealAnchorInDocument'
  | 'onPersistPdfViewState'
  | 'onRevealDocumentPosition'
  | 'onRevealDocumentSelection'
  | 'onResolveDocumentPositionAtViewportY'
  | 'onPastedTextAnchors'
>;

export type WorkspaceLayoutEditorCommandProps = Pick<WorkspaceLayoutFieldTypes,
  | 'onCloseContextMenu'
  | 'onCopyImage'
  | 'onCreateHighlight'
  | 'onCreateNote'
  | 'onOpenSelectionNote'
  | 'onDeleteExistingHighlight'
  | 'onOpenExistingHighlight'
  | 'onRepairTable'
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

export type WorkspaceLayoutReadingPositionProps = Pick<WorkspaceLayoutFieldTypes,
  | 'beginApplyingReadingPosition'
  | 'completeApplyingReadingPosition'
  | 'getReadingPositionRestoreCommand'
  | 'getReadingPositionSelection'
  | 'getReadingPositionSyncState'
  | 'getReadingPositionTargetViewportMode'
  | 'getReadingPositionTargetViewportRatio'
  | 'setReadingPositionSelection'
>;

export type WorkspaceLayoutReviewProps = Pick<WorkspaceLayoutFieldTypes,
  | 'canStartStudyMode'
  | 'reviewPreview'
  | 'isStudyMode'
  | 'isAnswerRevealed'
  | 'isCurrentReviewItemGradable'
  | 'isReviewEditing'
  | 'reviewCurrentNodeId'
  | 'reviewFlowWindow'
  | 'reviewPanelQueueNodeIds'
  | 'reviewQueueNodeIds'
  | 'reviewQueueVisibility'
  | 'reviewQueueCount'
  | 'reviewCompletedCount'
  | 'reviewStatus'
  | 'reviewSummary'
  | 'reviewSessionMode'
  | 'onStartStudyMode'
  | 'onToggleReviewSession'
  | 'onRevealAnswer'
  | 'onGradeReview'
  | 'onReadReviewTopic'
  | 'onPostponeReviewTopic'
  | 'onOpenPostponeTopicPanel'
  | 'onDismissReviewTopic'
  | 'onRevisitReviewTopicSoon'
  | 'onContinueReading'
  | 'onResumeReviewItem'
  | 'onExitReviewMode'
  | 'onSetReviewSessionMode'
  | 'reviewSchedulerSettings'
>;

export type WorkspaceLayoutChromeProps = Pick<WorkspaceLayoutFieldTypes,
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
  | 'onToggleRightSidebarVisibility'
>;

export type WorkspaceLayoutImportProps = Pick<WorkspaceLayoutFieldTypes,
  | 'isImportManagementOpen'
  | 'onOpenImportManagement'
  | 'onCloseImportManagement'
  | 'onRunImportFile'
  | 'onRunImportFolder'
  | 'onStartClipboardImport'
>;

export type WorkspaceLayoutExternalLibraryProps = Pick<WorkspaceLayoutFieldTypes,
  | 'isExternalViewOpen'
  | 'externalFolders'
  | 'externalEntriesByFolderId'
  | 'externalSelection'
  | 'onOpenExternalSelection'
  | 'onOpenExternalLibrarySettings'
  | 'onOpenExternalView'
  | 'onChangeExternalFolder'
  | 'onRemoveExternalFolder'
  | 'onRescanExternalFolder'
>;

export type WorkspaceLayoutSettingsProps = Pick<WorkspaceLayoutFieldTypes,
  | 'isSettingsOpen'
  | 'requestedSettingsCategory'
  | 'requestedSettingsDialog'
  | 'onOpenSettings'
  | 'onRunRailAction'
  | 'onCloseSettings'
>;

export type WorkspaceLayoutNodeListProps = Pick<WorkspaceLayoutFieldTypes,
  | 'onCreateChildNode'
  | 'nodeOrder'
  | 'nodesById'
  | 'onOpenNotesView'
  | 'onOpenMoveToNode'
>;

export type WorkspaceLayoutTrashProps = Pick<WorkspaceLayoutFieldTypes,
  | 'isTrashViewOpen'
  | 'isViewingTrashNode'
  | 'trashedNodeIds'
  | 'onSelectTrashNode'
  | 'onOpenTrashView'
  | 'selectedTrashNodeId'
>;

export type WorkspaceLayoutVirtualViewProps = Pick<WorkspaceLayoutFieldTypes,
  | 'manualVirtualCollections'
  | 'isVirtualViewOpen'
  | 'activeVirtualNodeId'
  | 'onOpenVirtualView'
>;

export type WorkspaceLayoutFlatProps =
  & WorkspaceLayoutNavigationProps
  & WorkspaceLayoutDocumentProps
  & WorkspaceLayoutEditorCommandProps
  & WorkspaceLayoutReadingPositionProps
  & WorkspaceLayoutReviewProps
  & WorkspaceLayoutChromeProps
  & WorkspaceLayoutImportProps
  & WorkspaceLayoutExternalLibraryProps
  & WorkspaceLayoutSettingsProps
  & WorkspaceLayoutNodeListProps
  & WorkspaceLayoutTrashProps
  & WorkspaceLayoutVirtualViewProps;
