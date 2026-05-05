import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
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
  const hasAnswerSection = activeNode?.reveal !== null;

  return (
    <section aria-label="Document area" className="panel-document-shell">
      <Panel
        ariaLabel="Document panel"
        actions={
          <div className="document-header-breadcrumbs">
            <NodeBreadcrumbs activeNodeId={activeNodeId} nodesById={nodesById} onSelectNode={onSelectNode} />
          </div>
        }
        bodyClassName="editor-body"
        className="panel-editor"
        style={documentLayoutStyle}
        title="Note"
      >
        <div className="document-width-shell" data-resizing={isDocumentResizing}>
          <DocumentWidthHandle
            ariaLabel="Resize document width from left"
            onPointerDown={(event) => onStartDocumentResize('left', event)}
            onResetLayout={onResetLayout}
            side="left"
          />
          <div className="document-width-frame">
            <div className="document-content-stack" data-has-reveal={hasAnswerSection}>
              <div className="document-editor-context-zone" onContextMenu={onEditorContextMenu}>
                <MarkdownEditor
                  ariaLabel="Prompt editor"
                  className="prompt-editor-host"
                  nodeId={editorNodeId}
                  nodeViewState={editorNodeViewState}
                  onChange={onEditorChange}
                  onReady={onEditorReady}
                  value={editorContent}
                />
              </div>
              {hasAnswerSection ? (
                <section aria-label="Cloze answer section" className="cloze-answer-zone">
                  <MarkdownEditor
                    ariaLabel="Answer editor"
                    className="answer-editor-host"
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
          onCreateHighlight={onCreateHighlight}
          onCreateCloze={onCreateCloze}
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
    <div className="document-width-handle" data-side={side}>
      <div
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className="document-width-grip"
        onDoubleClick={onResetLayout}
        onMouseDown={onPointerDown}
        onPointerDown={onPointerDown}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}
