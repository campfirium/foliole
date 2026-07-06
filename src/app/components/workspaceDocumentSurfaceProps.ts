import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';

import type { ExternalDocumentPreviewLoadState } from './externalSearchPreviewState';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

type WorkspaceDocumentSurfaceSource = Pick<
  WorkspaceLayoutProps,
  | 'document'
  | 'editorCommands'
  | 'externalLibrary'
  | 'layoutChrome'
  | 'navigation'
  | 'nodeList'
  | 'readingPosition'
  | 'review'
  | 'trash'
  | 'virtualView'
>;

type WorkspaceDocumentSurfaceFlatSource =
  WorkspaceLayoutProps['document'] &
  WorkspaceLayoutProps['editorCommands'] &
  WorkspaceLayoutProps['externalLibrary'] &
  Pick<WorkspaceLayoutProps['layoutChrome'], 'isImmersiveMode' | 'isWorkspaceHydrated'> &
  Pick<
    WorkspaceLayoutProps['navigation'],
    | 'canGoBack'
    | 'canGoForward'
    | 'canGoParent'
    | 'onGoBack'
    | 'onGoForward'
    | 'onGoParent'
    | 'onSelectBreadcrumbNode'
    | 'onSelectNode'
    | 'onSelectNodeInVirtualView'
  > &
  Pick<WorkspaceLayoutProps['trash'], 'onSelectTrashNode'> &
  Pick<WorkspaceLayoutProps['nodeList'], 'nodeOrder' | 'nodesById' | 'onCreateChildNode' | 'onOpenMoveToNode'> &
  WorkspaceLayoutProps['readingPosition'] &
  Pick<WorkspaceLayoutProps['review'], 'reviewSchedulerSettings'> &
  Pick<WorkspaceLayoutProps['trash'], 'isTrashViewOpen' | 'trashedNodeIds'> &
  Pick<WorkspaceLayoutProps['virtualView'], 'activeVirtualNodeId' | 'isVirtualViewOpen' | 'manualVirtualCollections'>;

export type WorkspaceDocumentSurfaceProps = WorkspaceDocumentSurfaceFlatSource & {
  documentNodeId: string | null;
  externalPreviewState?: ExternalDocumentPreviewLoadState;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onExternalPreviewEditorReady?: (adapter: EditorAdapter | null) => void;
  onShouldSuppressSelectionRestore: () => boolean;
  reviewCaretLineHighlight: boolean;
  reviewEscapeBlurEnabled: boolean;
  showDocumentOutline?: boolean;
};

type WorkspaceDocumentSurfaceSelectorArgs = {
  documentNodeId: string | null;
  isImmersiveEditing: boolean;
  onEnterImmersiveEdit: () => void;
  onShouldSuppressSelectionRestore: () => boolean;
  props: WorkspaceDocumentSurfaceSource;
};

function selectDocumentSurfaceState({
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: WorkspaceDocumentSurfaceSelectorArgs) {
  return {
    documentNodeId,
    isEditorReadOnly: props.document.isEditorReadOnly,
    isExternalViewOpen: props.externalLibrary.isExternalViewOpen,
    isImmersiveEditing,
    isImmersiveMode: props.layoutChrome.isImmersiveMode,
    isPriorityQuickSetActive: props.document.isPriorityQuickSetActive,
    reviewCaretLineHighlight: props.review.isStudyMode && props.review.isReviewEditing,
    reviewEscapeBlurEnabled: props.review.isStudyMode,
    isTrashViewOpen: props.trash.isTrashViewOpen,
    isVirtualViewOpen: props.virtualView.isVirtualViewOpen,
    onEnterImmersiveEdit,
    onShouldSuppressSelectionRestore,
    showAnswerSection: props.document.showAnswerSection,
    ...definedProps({
      activeVirtualNodeId: props.virtualView.activeVirtualNodeId,
      isWorkspaceHydrated: props.layoutChrome.isWorkspaceHydrated
    })
  };
}

function selectDocumentSurfaceData(props: WorkspaceDocumentSurfaceSource) {
  return {
    contextMenu: props.document.contextMenu,
    editorAdapterRef: props.document.editorAdapterRef,
    editorContent: props.document.editorContent,
    editorNodeId: props.document.editorNodeId,
    externalEntriesByFolderId: props.externalLibrary.externalEntriesByFolderId,
    externalFolders: props.externalLibrary.externalFolders,
    externalSelection: props.externalLibrary.externalSelection,
    nodeOrder: props.nodeList.nodeOrder,
    nodesById: props.nodeList.nodesById,
    onCreateChildNode: props.nodeList.onCreateChildNode,
    onOpenMoveToNode: props.nodeList.onOpenMoveToNode,
    nodeViewById: props.document.nodeViewById,
    priorityQuickSetShortcutLabel: props.document.priorityQuickSetShortcutLabel,
    reviewSchedulerSettings: props.review.reviewSchedulerSettings,
    trashedNodeIds: props.trash.trashedNodeIds,
    manualVirtualCollections: props.virtualView.manualVirtualCollections,
    ...definedProps({ editorNodeViewState: props.document.editorNodeViewState })
  };
}

function selectDocumentSurfaceNavigation(props: WorkspaceDocumentSurfaceSource) {
  return {
    canGoBack: props.navigation.canGoBack,
    canGoForward: props.navigation.canGoForward,
    canGoParent: props.navigation.canGoParent,
    onGoBack: props.navigation.onGoBack,
    onGoForward: props.navigation.onGoForward,
    onGoParent: props.navigation.onGoParent,
    onOpenExternalLibrarySettings: props.externalLibrary.onOpenExternalLibrarySettings,
    onOpenExternalSelection: props.externalLibrary.onOpenExternalSelection,
    onOpenExternalView: props.externalLibrary.onOpenExternalView,
    onChangeExternalFolder: props.externalLibrary.onChangeExternalFolder,
    onRemoveExternalFolder: props.externalLibrary.onRemoveExternalFolder,
    onRescanExternalFolder: props.externalLibrary.onRescanExternalFolder,
    onSelectBreadcrumbNode: props.navigation.onSelectBreadcrumbNode,
    onSelectNode: props.navigation.onSelectNode,
    onSelectNodeInVirtualView: props.navigation.onSelectNodeInVirtualView,
    onSelectTrashNode: props.trash.onSelectTrashNode
  };
}

function selectDocumentSurfaceEditorActions(props: WorkspaceDocumentSurfaceSource) {
  return {
    onAnswerChange: props.document.onAnswerChange,
    onCloseContextMenu: props.editorCommands.onCloseContextMenu,
    onCopyImage: props.editorCommands.onCopyImage,
    onCreateCloze: props.editorCommands.onCreateCloze,
    onCreateHighlight: props.editorCommands.onCreateHighlight,
    onCreateNote: props.editorCommands.onCreateNote,
    onOpenSelectionNote: props.editorCommands.onOpenSelectionNote,
    onDeleteExistingHighlight: props.editorCommands.onDeleteExistingHighlight,
    onOpenExistingHighlight: props.editorCommands.onOpenExistingHighlight,
    onRepairTable: props.editorCommands.onRepairTable,
    onAdjustExistingHighlightRange: props.editorCommands.onAdjustExistingHighlightRange,
    onCreateSelectionHighlight: props.editorCommands.onCreateSelectionHighlight,
    onToggleSelectionHighlight: props.editorCommands.onToggleSelectionHighlight,
    onCreateSelectionNote: props.editorCommands.onCreateSelectionNote,
    onCreatePdfHighlight: props.editorCommands.onCreatePdfHighlight,
    onCutImage: props.editorCommands.onCutImage,
    onDeleteImage: props.editorCommands.onDeleteImage,
    onEditorChange: props.document.onEditorChange,
    onEditorContextMenu: props.document.onEditorContextMenu,
    onEditorReady: props.document.onEditorReady,
    onEditorUndo: props.document.onEditorUndo,
    onEditorRedo: props.document.onEditorRedo,
    onFinalizeNodeTitle: props.document.onFinalizeNodeTitle,
    onExportImage: props.editorCommands.onExportImage,
    onNodeContentChange: props.document.onNodeContentChange,
    onNodeDesiredRetentionChange: props.document.onNodeDesiredRetentionChange,
    onNodePriorityChange: props.document.onNodePriorityChange,
    onNodeShortTermChange: props.document.onNodeShortTermChange,
    onEnterPriorityQuickSet: props.document.onEnterPriorityQuickSet,
    onPersistPdfViewState: props.document.onPersistPdfViewState,
    onRegisterEditorDraftFlush: props.document.onRegisterEditorDraftFlush,
    onResolveDocumentPositionAtViewportY: props.document.onResolveDocumentPositionAtViewportY,
    onRevealAnchorInDocument: props.document.onRevealAnchorInDocument,
    onRevealDocumentPosition: props.document.onRevealDocumentPosition,
    onRevealDocumentSelection: props.document.onRevealDocumentSelection,
    setNodeViewState: props.document.setNodeViewState,
    ...definedProps({
      onCreateClozeFromPayload: props.editorCommands.onCreateClozeFromPayload,
      onCreateHighlightFromPayload: props.editorCommands.onCreateHighlightFromPayload,
      onPastedTextAnchors: props.document.onPastedTextAnchors
    })
  };
}

function selectDocumentSurfaceReadingPosition(props: WorkspaceDocumentSurfaceSource) {
  return {
    beginApplyingReadingPosition: props.readingPosition.beginApplyingReadingPosition,
    completeApplyingReadingPosition: props.readingPosition.completeApplyingReadingPosition,
    getReadingPositionRestoreCommand: props.readingPosition.getReadingPositionRestoreCommand,
    getReadingPositionSelection: props.readingPosition.getReadingPositionSelection,
    getReadingPositionSyncState: props.readingPosition.getReadingPositionSyncState,
    getReadingPositionTargetViewportMode: props.readingPosition.getReadingPositionTargetViewportMode,
    getReadingPositionTargetViewportRatio: props.readingPosition.getReadingPositionTargetViewportRatio,
    setReadingPositionSelection: props.readingPosition.setReadingPositionSelection
  };
}

export function selectWorkspaceDocumentSurfaceProps({
  documentNodeId,
  isImmersiveEditing,
  onEnterImmersiveEdit,
  onShouldSuppressSelectionRestore,
  props
}: WorkspaceDocumentSurfaceSelectorArgs): WorkspaceDocumentSurfaceProps {
  return {
    ...selectDocumentSurfaceState({
      documentNodeId,
      isImmersiveEditing,
      onEnterImmersiveEdit,
      onShouldSuppressSelectionRestore,
      props
    }),
    ...selectDocumentSurfaceData(props),
    ...selectDocumentSurfaceNavigation(props),
    ...selectDocumentSurfaceEditorActions(props),
    ...selectDocumentSurfaceReadingPosition(props)
  };
}
