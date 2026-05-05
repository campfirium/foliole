import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

function buildReadingPositionProps(props: WorkspaceDocumentSurfaceProps) {
  return {
    editorReadingSelection: props.getReadingPositionSelection(),
    editorReadingTargetViewportMode: props.getReadingPositionTargetViewportMode(),
    editorReadingTargetViewportRatio: props.getReadingPositionTargetViewportRatio(),
    editorNodeViewState: props.editorNodeViewState,
    onBeginApplyingReadingPosition: props.beginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.completeApplyingReadingPosition,
    onSetReadingPositionSelection: props.setReadingPositionSelection
  };
}

function buildDocumentEditorProps(
  isImmersiveEditing: boolean,
  onShouldSuppressSelectionRestore: () => boolean,
  props: WorkspaceDocumentSurfaceProps
) {
  return {
    editorNodeId: props.editorNodeId,
    ...buildReadingPositionProps(props),
    isEditorReadOnly: props.isEditorReadOnly,
    isImmersiveEditing,
    isImmersiveMode: props.isImmersiveMode,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
    onRegisterEditorDraftFlush: props.onRegisterEditorDraftFlush,
    onShouldSuppressSelectionRestore,
    onNodeContentChange: props.onNodeContentChange,
    onNodePriorityChange: props.onNodePriorityChange,
    onPersistPdfViewState: props.onPersistPdfViewState,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    priorityQuickSetShortcutLabel: props.priorityQuickSetShortcutLabel,
    reviewSchedulerSettings: props.reviewSchedulerSettings,
    showAnswerSection: props.showAnswerSection
  };
}

export function buildDocumentSectionProps(
  documentNodeId: string | null,
  editorAppearanceKey: string,
  isImmersiveEditing: boolean,
  onShouldSuppressSelectionRestore: () => boolean,
  props: WorkspaceDocumentSurfaceProps
): DocumentPanelSectionProps {
  return {
    activeNodeId: documentNodeId,
    isWorkspaceHydrated: props.isWorkspaceHydrated,
    isTrashViewOpen: props.isTrashViewOpen,
    canGoBack: props.canGoBack,
    canGoForward: props.canGoForward,
    canGoParent: props.canGoParent,
    contextMenu: props.contextMenu,
    editableNodeId: props.editorNodeId,
    editorAppearanceKey,
    editorContent: props.editorContent,
    showDocumentOutline: props.showDocumentOutline,
    ...buildDocumentEditorProps(isImmersiveEditing, onShouldSuppressSelectionRestore, props),
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onCloseContextMenu: props.onCloseContextMenu,
    onCopyImage: props.onCopyImage,
    onCreateCloze: props.onCreateCloze,
    onCreateClozeFromPayload: props.onCreateClozeFromPayload,
    onCreateHighlight: props.onCreateHighlight,
    onCreateHighlightFromPayload: props.onCreateHighlightFromPayload,
    onCreateNote: props.onCreateNote,
    onDeleteExistingHighlight: props.onDeleteExistingHighlight,
    onPastedTextAnchors: props.onPastedTextAnchors,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onCutImage: props.onCutImage,
    onDeleteImage: props.onDeleteImage,
    onExportImage: props.onExportImage,
    onGoBack: props.onGoBack,
    onGoForward: props.onGoForward,
    onGoParent: props.onGoParent,
    onSelectBreadcrumbNode: props.onSelectBreadcrumbNode,
    onSelectNode: props.onSelectNode,
    onSelectNodeInVirtualView: props.onSelectNodeInVirtualView,
    trashedNodeIds: props.trashedNodeIds
  };
}
