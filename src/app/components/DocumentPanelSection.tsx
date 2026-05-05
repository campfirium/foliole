import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { cn } from '../../lib/utils';
import { AppIconButton } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { EditorContextMenu } from './EditorContextMenu';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  contextMenu: WorkspaceEditorContextMenu | null;
  documentMaxWidth: number;
  editorContent: string;
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
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodesById: Record<string, Node>;
}

export function DocumentPanelSection({
  activeNodeId,
  canGoBack,
  canGoForward,
  canGoParent,
  contextMenu,
  documentMaxWidth,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  isDocumentResizing,
  showAnswerSection,
  onAnswerChange,
  onEditorChange,
  onEditorContextMenu,
  onEditorReady,
  onCloseContextMenu,
  onCreateHighlight,
  onCreateCloze,
  onGoBack,
  onGoForward,
  onGoParent,
  onResetLayout,
  onSelectNode,
  onStartDocumentResize,
  nodesById
}: DocumentPanelSectionProps) {
  const documentLayoutStyle = {
    '--document-max-width': `${documentMaxWidth}px`
  } as CSSProperties;

  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const reveal = activeNode?.reveal ?? '';
  const hasAnswerContent = Boolean(activeNode?.reveal && activeNode.reveal.trim().length > 0);
  const hasAnswerSection = hasAnswerContent && showAnswerSection;

  return (
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col" style={documentLayoutStyle}>
      <section aria-label="Document panel" className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated text-foreground">
        <header className="flex min-h-[40px] items-center px-3">
          <h2 className="sr-only">Content</h2>
          <div className="flex shrink-0 items-center gap-1">
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              disabled={!canGoBack}
              icon={<ArrowLeftIcon />}
              label="Go back"
              onClick={onGoBack}
            />
            <AppIconButton
              className="size-8 text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground"
              disabled={!canGoForward}
              icon={<ArrowRightIcon />}
              label="Go forward"
              onClick={onGoForward}
            />
            <button aria-label="Go to parent node" className="sr-only" disabled={!canGoParent} onClick={onGoParent} type="button">
              Go to parent node
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mx-auto w-full [width:min(100%,var(--document-max-width))]">
              <NodeBreadcrumbs activeNodeId={activeNodeId} nodesById={nodesById} onSelectNode={onSelectNode} />
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 p-4 max-[1080px]:p-2">
          <div className="flex h-full min-h-0 w-full gap-2" data-resizing={isDocumentResizing}>
            <DocumentWidthHandle
              ariaLabel="Resize document width from left"
              onPointerDown={(event) => onStartDocumentResize('left', event)}
              onResetLayout={onResetLayout}
              side="left"
            />
            <div className="mx-auto flex h-full min-h-0 w-full [width:min(100%,var(--document-max-width))]">
              <div className="flex h-full min-h-0 w-full flex-1 flex-col">
                <div className="min-h-0 w-full flex-1" onContextMenu={onEditorContextMenu}>
                  <MarkdownEditor
                    ariaLabel="Prompt editor"
                    className="prompt-editor-host"
                    debugId="prompt-editor"
                    nodeId={editorNodeId}
                    nodeViewState={editorNodeViewState}
                    onChange={onEditorChange}
                    onReady={onEditorReady}
                    value={editorContent}
                  />
                </div>
                {hasAnswerSection ? (
                  <section
                    aria-label="Cloze answer section"
                    className="flex min-h-0 flex-[0_0_calc(30dvh+60px)] overflow-hidden border-t border-border pt-3"
                  >
                    <MarkdownEditor
                      ariaLabel="Answer editor"
                      className="answer-editor-host min-h-0"
                      debugId="answer-editor"
                      nodeId={editorNodeId}
                      onChange={onAnswerChange}
                      value={reveal}
                    />
                  </section>
                ) : null}
              </div>
            </div>
            <DocumentWidthHandle
              ariaLabel="Resize document width from right"
              onPointerDown={(event) => onStartDocumentResize('right', event)}
              onResetLayout={onResetLayout}
              side="right"
            />
          </div>
        </div>
      </section>

      {contextMenu ? (
        <EditorContextMenu
          canRunCommands={contextMenu.canRunCommands}
          left={contextMenu.left}
          onClose={onCloseContextMenu}
          onCreateCloze={onCreateCloze}
          onCreateHighlight={onCreateHighlight}
          top={contextMenu.top}
        />
      ) : null}
    </section>
  );
}

function ArrowLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M12.4 8H4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
      <path d="M7.6 5.2 4.8 8l2.8 2.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 16 16">
      <path d="M3.6 8h7.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.3" />
      <path d="m8.4 5.2 2.8 2.8-2.8 2.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </svg>
  );
}

interface DocumentWidthHandleProps {
  ariaLabel: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  side: ResizeSide;
}

function DocumentWidthHandle({ ariaLabel, onPointerDown, onResetLayout, side }: DocumentWidthHandleProps) {
  return (
    <div className="relative min-w-0 flex-1 max-[1080px]:hidden" data-side={side}>
      <div
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className={cn(
          'absolute top-0 h-full w-2.5 cursor-col-resize before:absolute before:h-full before:border-l before:border-transparent before:transition-colors hover:before:border-border-strong focus-visible:before:border-border-strong',
          side === 'left' ? 'right-0 before:right-0' : 'left-0 before:left-0'
        )}
        onDoubleClick={onResetLayout}
        onMouseDown={onPointerDown}
        onPointerDown={onPointerDown}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}
