import { definedProps } from '../../shared/lib/definedProps';

import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';
import type { WorkspaceDocumentSurfaceProps } from './workspaceDocumentSurfaceProps';

function buildReadingPositionProps(props: WorkspaceDocumentSurfaceProps) {
  const restoreCommand = props.getReadingPositionRestoreCommand();
  return {
    editorReadingRestoreCommandId: restoreCommand?.commandId ?? null,
    editorReadingSelection: restoreCommand?.selection ?? null,
    editorReadingTargetViewportMode: restoreCommand?.targetViewportMode ?? null,
    editorReadingTargetViewportRatio: restoreCommand?.targetViewportRatio ?? null,
    onBeginApplyingReadingPosition: props.beginApplyingReadingPosition,
    onCompleteApplyingReadingPosition: props.completeApplyingReadingPosition,
    onSetReadingPositionSelection: props.setReadingPositionSelection,
    ...definedProps({
      editorNodeViewState: props.editorNodeViewState,
      editorReadingRestoreScrollTop: restoreCommand?.scrollTop
    })
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
    isTrashViewOpen: props.isTrashViewOpen,
    canGoBack: props.canGoBack,
    canGoForward: props.canGoForward,
    canGoParent: props.canGoParent,
    contextMenu: props.contextMenu,
    editableNodeId: props.editorNodeId,
    editorAppearanceKey,
    editorContent: props.editorContent,
    ...buildDocumentEditorProps(isImmersiveEditing, onShouldSuppressSelectionRestore, props),
    nodeOrder: props.nodeOrder,
    nodesById: props.nodesById,
    onCloseContextMenu: props.onCloseContextMenu,
    onCopyImage: props.onCopyImage,
    onCreateCloze: props.onCreateCloze,
    onCreateHighlight: props.onCreateHighlight,
    onCreateNote: props.onCreateNote,
    onDeleteExistingHighlight: props.onDeleteExistingHighlight,
    onOpenExistingHighlight: props.onOpenExistingHighlight,
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
