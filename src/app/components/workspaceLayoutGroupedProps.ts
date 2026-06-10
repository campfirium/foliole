import {
  DOCUMENT_KEYS,
  EDITOR_COMMAND_KEYS,
  EXTERNAL_LIBRARY_KEYS,
  IMPORT_KEYS,
  LAYOUT_CHROME_KEYS,
  NAVIGATION_KEYS,
  NODE_LIST_KEYS,
  READING_POSITION_KEYS,
  REVIEW_KEYS,
  SETTINGS_KEYS,
  TRASH_KEYS,
  VIRTUAL_VIEW_KEYS,
  pickLayoutProps
} from './workspaceLayoutGroupedPropKeys';
import type { LayoutStateKeys } from './workspaceLayoutGroupedPropKeys';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';

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
  editorCommands: Pick<WorkspaceLayoutFlatProps,
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
    navigation: pickLayoutProps(flatProps, NAVIGATION_KEYS),
    document: pickLayoutProps(flatProps, DOCUMENT_KEYS),
    editorCommands: pickLayoutProps(flatProps, EDITOR_COMMAND_KEYS),
    readingPosition: pickLayoutProps(flatProps, READING_POSITION_KEYS),
    review: pickLayoutProps(flatProps, REVIEW_KEYS),
    layoutChrome: pickLayoutProps(flatProps, LAYOUT_CHROME_KEYS),
    imports: pickLayoutProps(flatProps, IMPORT_KEYS),
    externalLibrary: pickLayoutProps(flatProps, EXTERNAL_LIBRARY_KEYS),
    settings: pickLayoutProps(flatProps, SETTINGS_KEYS),
    nodeList: pickLayoutProps(flatProps, NODE_LIST_KEYS),
    trash: pickLayoutProps(flatProps, TRASH_KEYS),
    virtualView: pickLayoutProps(flatProps, VIRTUAL_VIEW_KEYS)
  };
}
