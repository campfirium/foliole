import { X } from 'lucide-react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelBody } from './DocumentPanelBody';
import { DocumentPanelHeader } from './DocumentPanelHeader';
import { EditorContextMenu } from './EditorContextMenu';
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
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  showAnswerSection: boolean;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onCloseContextMenu: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
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

function getDocumentPanelState(props: DocumentPanelSectionProps, editorDisplayMode: 'preview' | 'source') {
  const activeNode = props.activeNodeId ? props.nodesById[props.activeNodeId] : undefined;
  const emptyState = resolveInboxEmptyState(activeNode);
  const reveal = activeNode?.reveal ?? '';

  return {
    editorContentPaddingBottom: editorDisplayMode === 'preview' ? 'min(68dvh, 36rem)' : undefined,
    emptyState,
    hasAnswerSection: Boolean(!emptyState && activeNode?.reveal && activeNode.reveal.trim().length > 0 && props.showAnswerSection),
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
    reveal
  };
}

function normalizeNodeViewState(viewState: NodeViewState): NodeViewState {
  return {
    scrollTop: Math.max(0, Math.trunc(viewState.scrollTop)),
    selection: {
      from: Math.max(0, Math.trunc(viewState.selection.from)),
      to: Math.max(0, Math.trunc(viewState.selection.to))
    }
  };
}

function isSameNodeViewState(left: NodeViewState | undefined, right: NodeViewState) {
  return left?.scrollTop === right.scrollTop && left?.selection.from === right.selection.from && left?.selection.to === right.selection.to;
}

function useSplitPanelNodeViewState(activeNodeId: string | null, isSplitPanelOpen: boolean) {
  const [panelNodeViewById, setPanelNodeViewById] = useState<Record<string, NodeViewState | undefined>>({});
  const panelEditorRef = useRef<EditorAdapter | null>(null);
  const panelNodeViewState = activeNodeId ? panelNodeViewById[activeNodeId] : undefined;

  useEffect(() => {
    if (!isSplitPanelOpen || !activeNodeId) {
      return;
    }
    const capturePanelViewState = () => {
      const adapter = panelEditorRef.current;
      if (!adapter) {
        return;
      }
      const nextViewState = normalizeNodeViewState({
        scrollTop: adapter.getScrollTop(),
        selection: adapter.getSelection()
      });
      setPanelNodeViewById((current) => {
        if (isSameNodeViewState(current[activeNodeId], nextViewState)) {
          return current;
        }
        return {
          ...current,
          [activeNodeId]: nextViewState
        };
      });
    };
    capturePanelViewState();
    const timer = window.setInterval(capturePanelViewState, 240);
    return () => {
      window.clearInterval(timer);
      capturePanelViewState();
    };
  }, [activeNodeId, isSplitPanelOpen]);

  return {
    panelEditorRef,
    panelNodeViewState
  };
}

function DocumentSplitPanelSurface({
  bodyProps,
  panelNodeViewState,
  panelEditorRef,
  onOpenChange,
  open
}: {
  bodyProps: ReturnType<typeof getDocumentPanelBodyProps>;
  panelNodeViewState?: NodeViewState;
  panelEditorRef: React.MutableRefObject<EditorAdapter | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AppDialog onOpenChange={onOpenChange} open={open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent
          aria-describedby={undefined}
          className="left-1/2 top-1/2 h-[min(820px,calc(100vh-88px))] w-[min(1520px,calc(100vw-72px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-border/35 bg-bg-panel p-0"
        >
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <AppDialogTitle className="sr-only">Document split panel</AppDialogTitle>
            <header className="flex h-12 flex-none items-center justify-end border-b border-border px-4">
              <AppButton aria-label="Close split panel" className="size-8 px-0" onClick={() => onOpenChange(false)} variant="ghost">
                <X aria-hidden="true" size={15} strokeWidth={1.9} />
              </AppButton>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
              <div className="flex min-h-0 min-w-0 overflow-hidden bg-bg-elevated">
                <DocumentPanelBody
                  {...bodyProps}
                  answerEditorDebugId={undefined}
                  editorNodeViewState={panelNodeViewState}
                  onEditorContextMenu={undefined}
                  onEditorReady={(adapter) => {
                    panelEditorRef.current = adapter;
                  }}
                  onRevealDocumentPosition={() => undefined}
                  onRevealDocumentSelection={() => undefined}
                  onResolveDocumentPositionAtViewportY={() => null}
                  promptEditorDebugId={undefined}
                  showDocumentOutline={false}
                  showDocumentResizeHandles={false}
                />
              </div>
              <section aria-label="Split panel placeholder" className="app-scrollbar min-h-0 min-w-0 overflow-auto border-l border-border bg-bg-panel/40" />
            </div>
          </section>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function DocumentPanelSection(props: DocumentPanelSectionProps) {
  const { editorDisplayMode } = useAppearanceSettings();
  const [isSplitPanelOpen, setIsSplitPanelOpen] = useState(false);
  const { editorContentPaddingBottom, emptyState, hasAnswerSection, reveal } = getDocumentPanelState(props, editorDisplayMode);
  const documentLayoutStyle = { '--document-max-width': `${props.documentMaxWidth}px` } as CSSProperties;
  const bodyProps = getDocumentPanelBodyProps(props, editorContentPaddingBottom, emptyState, hasAnswerSection, reveal);
  const { panelEditorRef, panelNodeViewState } = useSplitPanelNodeViewState(props.activeNodeId, isSplitPanelOpen);

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
        <DocumentPanelHeader
          activeNodeId={props.activeNodeId}
          canGoBack={props.canGoBack}
          canGoForward={props.canGoForward}
          canGoParent={props.canGoParent}
          isSplitPanelOpen={isSplitPanelOpen}
          nodesById={props.nodesById}
          onGoBack={props.onGoBack}
          onGoForward={props.onGoForward}
          onGoParent={props.onGoParent}
          onSelectNode={props.onSelectNode}
          onToggleSplitPanel={() => setIsSplitPanelOpen((current) => !current)}
        />
        <DocumentPanelBody {...bodyProps} />
      </section>
      <DocumentSplitPanelSurface
        bodyProps={bodyProps}
        onOpenChange={setIsSplitPanelOpen}
        open={isSplitPanelOpen}
        panelEditorRef={panelEditorRef}
        panelNodeViewState={panelNodeViewState}
      />
      {props.contextMenu ? (
        <EditorContextMenu
          canRunCommands={props.contextMenu.canRunCommands}
          left={props.contextMenu.left}
          onClose={props.onCloseContextMenu}
          onCreateCloze={props.onCreateCloze}
          onCreateHighlight={props.onCreateHighlight}
          top={props.contextMenu.top}
        />
      ) : null}
    </section>
  );
}
