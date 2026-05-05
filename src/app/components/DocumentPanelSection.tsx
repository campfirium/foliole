import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode, isVirtualNode } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelHeader } from './DocumentPanelHeader';
import { DocumentPanelContent, DocumentPanelContextMenu } from './DocumentPanelSectionParts';
import { DocumentPanelSourceUpdatePanel } from './DocumentPanelSourceUpdatePanel';
import { useNodeSourceUpdatePreview } from './useNodeSourceUpdatePreview';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  editableNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
  editorAppearanceKey: string;
  isEditorReadOnly: boolean;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  showAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onNodeContentChange: (nodeId: string, content: string) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onCloseContextMenu: () => void;
  onCopyImage: () => void;
  onCreateHighlight: () => void;
  onCreatePdfHighlight: (selectionText: string) => boolean;
  onCreateCloze: () => void;
  onCutImage: () => void;
  onDeleteImage: () => void;
  onExportImage: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onRevealDocumentPosition: (position: number) => void;
  onRevealDocumentSelection: (selection: EditorSelection) => void;
  onResolveDocumentPositionAtViewportY: (clientY: number) => number | null;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
}
function resolveInboxEmptyState(activeNode: Node | undefined) {
  return isInboxNode(activeNode)
    ? {
        title: 'Inbox is ready',
        description:
          'Formal imports will land under Inbox. When items arrive, select a child node to read or edit it.'
      }
    : undefined;
}

function getDocumentPanelState(
  activeNode: Node | undefined,
  editorDisplayMode: 'preview' | 'source',
  showAnswerSection: boolean
) {
  const emptyState = resolveInboxEmptyState(activeNode);
  const reveal = activeNode?.reveal ?? '';

  return {
    editorContentPaddingBottom: editorDisplayMode === 'preview' ? 'min(68dvh, 36rem)' : undefined,
    emptyState,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && showAnswerSection),
    reveal
  };
}

function getDocumentPanelBodyProps(
  props: DocumentPanelSectionProps,
  editorContentPaddingBottom: string | undefined,
  emptyState: ReturnType<typeof resolveInboxEmptyState>,
  hasAnswerSection: boolean,
  reveal: string
) {
  return {
    documentMaxWidth: props.documentMaxWidth,
    editorAppearanceKey: props.editorAppearanceKey,
    editorContent: props.editorContent,
    editorContentPaddingBottom,
    editorHideTitleHeading: props.activeNodeId ? Boolean(props.nodesById[props.activeNodeId]?.hideTitleHeading) : false,
    editorNodeId: props.editorNodeId,
    editorNodeViewState: props.editorNodeViewState,
    emptyState,
    hasAnswerSection,
    isDocumentResizing: props.isDocumentResizing,
    onAnswerChange: props.onAnswerChange,
    onEditorChange: props.onEditorChange,
    onEditorContextMenu: props.onEditorContextMenu,
    onEditorReady: props.onEditorReady,
    onRevealDocumentPosition: props.onRevealDocumentPosition,
    onRevealDocumentSelection: props.onRevealDocumentSelection,
    onResolveDocumentPositionAtViewportY: props.onResolveDocumentPositionAtViewportY,
    onResetLayout: props.onResetLayout,
    onStartDocumentResize: props.onStartDocumentResize,
    readOnly: props.isEditorReadOnly,
    reveal
  };
}

function getDocumentPanelView(props: DocumentPanelSectionProps, editorDisplayMode: 'preview' | 'source') {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const { editorContentPaddingBottom, emptyState, hasAnswerSection, reveal } = getDocumentPanelState(
    activeNode,
    editorDisplayMode,
    props.showAnswerSection
  );

  return {
    bodyProps: getDocumentPanelBodyProps(props, editorContentPaddingBottom, emptyState, hasAnswerSection, reveal),
    documentLayoutStyle: { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties,
    isFolderListView: Boolean(
      activeNode &&
        activeNode.kind === 'folder' &&
        !isInboxNode(activeNode) &&
        !isVirtualNode(activeNode) &&
        props.editorNodeId === props.activeNodeId
    )
  };
}

function useSourceUpdatePanelState(props: DocumentPanelSectionProps) {
  const [isSourceUpdatePanelOpen, setIsSourceUpdatePanelOpen] = useState(false);
  const [sourceUpdateDraftContent, setSourceUpdateDraftContent] = useState<string | null>(null);
  const sourceUpdateDraftRef = useRef<string | null>(null);
  const sourceUpdatePreview = useNodeSourceUpdatePreview(props.activeNodeId);

  const flushSourceUpdateDraft = useCallback(() => {
    const draft = sourceUpdateDraftRef.current;
    if (draft === null || draft === props.editorContent) {
      return;
    }
    if (!props.editorNodeId) {
      props.onEditorChange(draft);
      return;
    }
    props.onNodeContentChange(props.editorNodeId, draft);
  }, [props.editorContent, props.editorNodeId, props.onEditorChange, props.onNodeContentChange]);

  const handleSourceUpdatePanelOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        const nextDraft = sourceUpdateDraftRef.current ?? props.editorContent;
        sourceUpdateDraftRef.current = nextDraft;
        setSourceUpdateDraftContent(nextDraft);
        setIsSourceUpdatePanelOpen(true);
        return;
      }

      flushSourceUpdateDraft();
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent(null);
      setIsSourceUpdatePanelOpen(false);
    },
    [flushSourceUpdateDraft, props.editorContent]
  );

  useEffect(() => {
    if (isSourceUpdatePanelOpen && !sourceUpdatePreview.value && !sourceUpdatePreview.isLoading) {
      handleSourceUpdatePanelOpenChange(false);
    }
  }, [handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview.isLoading, sourceUpdatePreview.value]);

  useEffect(() => {
    if (!isSourceUpdatePanelOpen) {
      sourceUpdateDraftRef.current = null;
      setSourceUpdateDraftContent((current) => (current === null ? current : null));
      return;
    }
    sourceUpdateDraftRef.current = props.editorContent;
    setSourceUpdateDraftContent((current) => (current === props.editorContent ? current : props.editorContent));
  }, [isSourceUpdatePanelOpen, props.editorContent, props.editorNodeId]);

  return {
    currentSourceUpdateContent: sourceUpdateDraftContent ?? props.editorContent,
    handleSourceUpdateDraftChange: (content: string) => {
      sourceUpdateDraftRef.current = content;
      setSourceUpdateDraftContent(content);
    },
    handleSourceUpdatePanelOpenChange,
    isSourceUpdatePanelOpen,
    sourceUpdatePreview
  };
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  const { editorDisplayMode } = useAppearanceSettings();
  const { bodyProps, documentLayoutStyle, isFolderListView } = getDocumentPanelView(props, editorDisplayMode);
  const { currentSourceUpdateContent, handleSourceUpdateDraftChange, handleSourceUpdatePanelOpenChange, isSourceUpdatePanelOpen, sourceUpdatePreview } = useSourceUpdatePanelState(props);
  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
        <DocumentPanelHeader
          activeNodeId={props.activeNodeId}
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          isSourceUpdatePanelOpen={isSourceUpdatePanelOpen}
          nodesById={props.nodesById}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
          onSelectNode={props.onSelectNode}
          onToggleSourceUpdatePanel={() => handleSourceUpdatePanelOpenChange(!isSourceUpdatePanelOpen)}
          showSourceUpdateAction={Boolean(sourceUpdatePreview.value)}
        />
        <DocumentPanelContent
          activeNodeId={props.activeNodeId}
          bodyProps={bodyProps}
        isFolderListView={isFolderListView}
        nodeOrder={props.nodeOrder}
        nodesById={props.nodesById}
        onCreatePdfHighlight={props.onCreatePdfHighlight}
        onSelectNode={props.onSelectNode}
        onNodeContentChange={props.onNodeContentChange}
      />
      </section>
      {sourceUpdatePreview.value ? (
        <DocumentPanelSourceUpdatePanel
          currentContent={currentSourceUpdateContent}
          documentMaxWidth={props.documentMaxWidth}
          editorAppearanceKey={props.editorAppearanceKey}
          editorNodeId={props.editorNodeId}
          onCurrentContentChange={handleSourceUpdateDraftChange}
          onOpenChange={handleSourceUpdatePanelOpenChange}
          open={isSourceUpdatePanelOpen}
          updatedContent={sourceUpdatePreview.value.updatedContent}
        />
      ) : null}
      <DocumentPanelContextMenu
        contextMenu={props.contextMenu}
        onCloseContextMenu={props.onCloseContextMenu}
        onCopyImage={props.onCopyImage}
        onCreateCloze={props.onCreateCloze}
        onCreateHighlight={props.onCreateHighlight}
        onCutImage={props.onCutImage}
        onDeleteImage={props.onDeleteImage}
        onExportImage={props.onExportImage}
      />
    </section>
  );
}
