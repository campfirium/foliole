import type { DocumentPanelSectionProps } from './DocumentPanelSection';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function buildReadingPositionProps(props: WorkspaceLayoutProps) {
  return {
    editorReadingSelection: props.getReadingPositionSelection(),
    editorNodeViewState: props.editorNodeViewState,
    onBeginApplyingReadingPosition: props.beginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.completeApplyingReadingPosition,
    onSetReadingPositionSelection: props.setReadingPositionSelection
  };
}

export function buildDocumentSectionProps(
  documentNodeId: string | null,
  editorAppearanceKey: string,
  isImmersiveEditing: boolean,
  onShouldSuppressSelectionRestore: () => boolean,
  props: WorkspaceLayoutProps
): DocumentPanelSectionProps {
  return {
    activeNodeId: documentNodeId,
    isWorkspaceHydrated: props.isWorkspaceHydrated,
    canGoBack: props.canGoBack,
    canGoForward: props.canGoForward,
    canGoParent: props.canGoParent,
    contextMenu: props.contextMenu,
    documentMaxWidth: props.documentMaxWidth,
    editableNodeId: props.editorNodeId,
    editorAppearanceKey,
    editorContent: props.editorContent,
    editorNodeId: props.editorNodeId,
    ...buildReadingPositionProps(props),
    isDocumentResizing: props.isDocumentResizing,
    isEditorReadOnly: props.isEditorReadOnly,
    isImmersiveEditing,
    isImmersiveMode: props.isImmersiveMode,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive,
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onAnswerChange: props.onAnswerChange,
    onCloseContextMenu: props.onCloseContextMenu,
    onCopyImage: props.onCopyImage,
    onCreateCloze: props.onCreateCloze,
    onCreateHighlight: props.onCreateHighlight,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onCutImage: props.onCutImage,
    onDeleteImage: props.onDeleteImage,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
    onShouldSuppressSelectionRestore,
    onExportImage: props.onExportImage,
    onGoBack: props.onGoBack,
    onGoForward: props.onGoForward,
    onGoParent: props.onGoParent,
    onNodeContentChange: props.onNodeContentChange,
    onNodePriorityChange: props.onNodePriorityChange,
    onPersistPdfViewState: props.onPersistPdfViewState,
    onResetLayout: props.onResetLayout,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    onSelectBreadcrumbNode: props.onSelectBreadcrumbNode,
    onSelectNode: props.onSelectNode,
    onStartDocumentResize: props.onStartDocumentResize,
    priorityQuickSetShortcutLabel: props.priorityQuickSetShortcutLabel,
    reviewSchedulerSettings: props.reviewSchedulerSettings,
    showAnswerSection: props.showAnswerSection,
    trashedNodeIds: props.trashedNodeIds
  };
}
