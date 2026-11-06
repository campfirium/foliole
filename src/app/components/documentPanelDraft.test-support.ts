import type { DocumentPanelSectionProps } from './documentPanelSectionTypes';

export function editorHandoffPanelProps(
  state: Pick<DocumentPanelSectionProps, 'activeNodeId' | 'nodesById' | 'nodeOrder' | 'trashedNodeIds'>,
  onNodeContentChange: DocumentPanelSectionProps['onNodeContentChange']
): DocumentPanelSectionProps {
  return {
    ...state, editableNodeId: state.activeNodeId, editorNodeId: state.activeNodeId,
    editorContent: state.nodesById[state.activeNodeId!]!.content,
    editorAppearanceKey: 'test', isEditorReadOnly: false, showAnswerSection: false,
    canGoBack: false, canGoForward: false, canGoParent: false, contextMenu: null,
    onNodeContentChange,
    onAnswerChange: () => undefined, onEditorChange: () => undefined,
    onEditorContextMenu: () => undefined, onExitEditorFocus: () => false,
    onEditorReady: () => undefined, onCloseContextMenu: () => undefined,
    onCopyImage: () => undefined, onCreateHighlight: () => undefined,
    onCreatePdfHighlight: () => false, onAdjustExistingHighlightRange: () => false,
    onCreateCloze: () => undefined, onCutImage: () => undefined,
    onDeleteImage: () => undefined, onExportImage: () => undefined,
    onGoBack: () => undefined, onGoForward: () => undefined, onGoParent: () => undefined,
    onSelectBreadcrumbNode: () => undefined, onPersistPdfViewState: () => undefined,
    onRevealDocumentPosition: () => undefined, onRevealDocumentSelection: () => undefined,
    onResolveDocumentPositionAtViewportY: () => null, onSelectNode: () => undefined
  };
}
