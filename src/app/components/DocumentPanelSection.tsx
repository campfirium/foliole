import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { cn } from '../../lib/utils';
import { Panel } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { EditorContextMenu } from './EditorContextMenu';
import type { WorkspaceEditorContextMenu } from './WorkspaceLayout';

interface DocumentPanelSectionProps {
  activeNodeId: string | null;
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
    <section aria-label="Document area" className="flex min-h-0 flex-1 flex-col">
      <Panel
        ariaLabel="Document panel"
        center={<NodeBreadcrumbs activeNodeId={activeNodeId} nodesById={nodesById} onSelectNode={onSelectNode} />}
        bodyClassName="flex min-h-0 flex-1 p-4 max-[1080px]:p-2"
        className="h-full min-h-0 flex-1"
        style={documentLayoutStyle}
        title="Content"
      >
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
                <section aria-label="Cloze answer section" className="flex min-h-0 flex-[0_0_calc(30dvh+60px)] overflow-hidden border-t border-border pt-3">
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
      </Panel>
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
          'absolute top-0 h-full w-2.5 cursor-col-resize before:absolute before:h-full before:border-l before:border-dashed before:border-transparent before:transition-colors hover:before:border-slate-300 focus-visible:before:border-slate-300',
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
