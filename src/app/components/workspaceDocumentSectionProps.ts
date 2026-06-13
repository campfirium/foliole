import { definedProps } from '../../shared/lib/definedProps';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

function buildReadingPositionProps(
  editorState: ReturnType<typeof resolveDocumentEditorState>,
  props: WorkspaceDocumentSurfaceProps
) {
  const restoreCommand = props.getReadingPositionRestoreCommand();
  return {
    editorReadingRestoreCommandId: restoreCommand?.commandId ?? null,
    editorReadingSelection: restoreCommand?.selection ?? null,
    editorReadingSelectionMode: restoreCommand?.selectionMode ?? 'caret',
    editorReadingTargetViewportMode: restoreCommand?.targetViewportMode ?? null,
    editorReadingTargetViewportRatio: restoreCommand?.targetViewportRatio ?? null,
    onBeginApplyingReadingPosition: props.beginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.completeApplyingReadingPosition,
    onSetReadingPositionSelection: props.setReadingPositionSelection,
    ...definedProps({
      editorNodeViewState: editorState.editorNodeViewState,
      editorReadingRestoreScrollTop: restoreCommand?.scrollTop
    })
  };
}

function resolveDocumentEditorState(
  documentNodeId: string | null,
  props: WorkspaceDocumentSurfaceProps
) {
  const currentState = {
    editorContent: props.editorContent,
    editorNodeId: props.editorNodeId,
    editorNodeViewState: props.editorNodeViewState,
    isEditorReadOnly: props.isEditorReadOnly
  };
  if (!props.isTrashViewOpen || !documentNodeId || documentNodeId === props.editorNodeId) {
    return currentState;
  }

  const node = props.nodesById[documentNodeId];
  if (!node || node.kind === 'folder') {
    return currentState;
  }

  return {
    editorContent: node.content,
    editorNodeId: documentNodeId,
    editorNodeViewState: props.nodeViewById[documentNodeId],
    isEditorReadOnly: true
  };
}

function buildDocumentEditorProps(
  editorState: ReturnType<typeof resolveDocumentEditorState>,
  isImmersiveEditing: boolean,
  onShouldSuppressSelectionRestore: () => boolean,
  props: WorkspaceDocumentSurfaceProps
) {
  return {
    editorNodeId: editorState.editorNodeId,
    ...buildReadingPositionProps(editorState, props),
    isEditorReadOnly: editorState.isEditorReadOnly,
    reviewCaretLineHighlight: props.reviewCaretLineHighlight,
    reviewEscapeBlurEnabled: props.reviewEscapeBlurEnabled,
    isImmersiveEditing,
    isImmersiveMode: props.isImmersiveMode,
    isPriorityQuickSetActive: props.isPriorityQuickSetActive,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorUndo: props.onEditorUndo,
    onEditorRedo: props.onEditorRedo,
    onFinalizeNodeTitle: props.onFinalizeNodeTitle,
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
  const editorState = resolveDocumentEditorState(documentNodeId, props);
  return {
    activeNodeId: documentNodeId,
    isTrashViewOpen: props.isTrashViewOpen,
    canGoBack: props.canGoBack,
    canGoForward: props.canGoForward,
    canGoParent: props.canGoParent,
    contextMenu: props.contextMenu,
    editableNodeId: editorState.editorNodeId,
    editorAppearanceKey,
    editorContent: editorState.editorContent,
    ...buildDocumentEditorProps(editorState, isImmersiveEditing, onShouldSuppressSelectionRestore, props),
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onCloseContextMenu: props.onCloseContextMenu,
    onCopyImage: props.onCopyImage,
    onCreateCloze: props.onCreateCloze,
    onCreateHighlight: props.onCreateHighlight,
    onCreateNote: props.onCreateNote,
    onDeleteExistingHighlight: props.onDeleteExistingHighlight,
    onOpenExistingHighlight: props.onOpenExistingHighlight,
    onRepairTable: props.onRepairTable,
    onAdjustExistingHighlightRange: props.onAdjustExistingHighlightRange,
    onCreatePdfHighlight: props.onCreatePdfHighlight,
    onCutImage: props.onCutImage,
    onDeleteImage: props.onDeleteImage,
    onExportImage: props.onExportImage,
    onGoBack: props.onGoBack,
    onGoForward: props.onGoForward,
    onGoParent: props.onGoParent,
    onOpenMoveToNode: props.onOpenMoveToNode,
    onSelectBreadcrumbNode: props.onSelectBreadcrumbNode,
    onSelectNode: props.onSelectNode,
    trashedNodeIds: props.trashedNodeIds,
    ...definedProps({
      isWorkspaceHydrated: props.isWorkspaceHydrated,
      onCreateClozeFromPayload: props.onCreateClozeFromPayload,
      onCreateHighlightFromPayload: props.onCreateHighlightFromPayload,
      onPastedTextAnchors: props.onPastedTextAnchors,
      onSelectNodeInVirtualView: props.onSelectNodeInVirtualView,
      onSelectTrashNode: props.onSelectTrashNode,
      showDocumentOutline: props.showDocumentOutline
    })
  };
}
