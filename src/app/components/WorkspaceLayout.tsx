import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { Panel } from '../../shared/ui';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

export interface WorkspaceLayoutProps {
  activeNodeId: string | null;
  documentMaxWidth: number;
  editorContent: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  isResizingList: boolean;
  listWidth: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onEditorChange: (content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
}

export function WorkspaceLayout({
  activeNodeId,
  documentMaxWidth,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  isDocumentResizing,
  isResizingList,
  listWidth,
  nodeOrder,
  nodesById,
  onEditorChange,
  onEditorReady,
  onResetLayout,
  onSelectNode,
  onSplitterKeyDown,
  onSplitterPointerDown,
  onStartDocumentResize
}: WorkspaceLayoutProps) {
  const workspaceGridStyle = {
    '--workspace-list-width': `${listWidth}px`
  } as CSSProperties;

  return (
    <main aria-label="Foliole workspace" className="workspace-shell">
      <div className="workspace-grid" data-resizing={isResizingList} style={workspaceGridStyle}>
        <NodeListTree
          activeNodeId={activeNodeId}
          nodeOrder={nodeOrder}
          nodesById={nodesById}
          onSelectNode={onSelectNode}
        />
        <ListSplitter
          listWidth={listWidth}
          onResetLayout={onResetLayout}
          onSplitterKeyDown={onSplitterKeyDown}
          onSplitterPointerDown={onSplitterPointerDown}
        />
        <DocumentPanelSection
          activeNodeId={activeNodeId}
          documentMaxWidth={documentMaxWidth}
          editorContent={editorContent}
          editorNodeId={editorNodeId}
          editorNodeViewState={editorNodeViewState}
          isDocumentResizing={isDocumentResizing}
          onEditorChange={onEditorChange}
          onEditorReady={onEditorReady}
          onResetLayout={onResetLayout}
          onSelectNode={onSelectNode}
          onStartDocumentResize={onStartDocumentResize}
          nodesById={nodesById}
        />
      </div>
    </main>
  );
}

interface ListSplitterProps {
  listWidth: number;
  onResetLayout: () => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function ListSplitter({ listWidth, onResetLayout, onSplitterKeyDown, onSplitterPointerDown }: ListSplitterProps) {
  return (
    <div
      aria-label="Resize node list"
      aria-orientation="vertical"
      aria-valuenow={Math.round(listWidth)}
      className="workspace-splitter"
      onDoubleClick={onResetLayout}
      onKeyDown={onSplitterKeyDown}
      onPointerDown={onSplitterPointerDown}
      role="separator"
      tabIndex={0}
    />
  );
}

interface DocumentPanelSectionProps {
  activeNodeId: string | null;
  documentMaxWidth: number;
  editorContent: string;
  editorNodeId: string | null;
  editorNodeViewState?: NodeViewState;
  isDocumentResizing: boolean;
  onEditorChange: (content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onResetLayout: () => void;
  onSelectNode: (nodeId: string) => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  nodesById: Record<string, Node>;
}

function DocumentPanelSection({
  activeNodeId,
  documentMaxWidth,
  editorContent,
  editorNodeId,
  editorNodeViewState,
  isDocumentResizing,
  onEditorChange,
  onEditorReady,
  onResetLayout,
  onSelectNode,
  onStartDocumentResize,
  nodesById
}: DocumentPanelSectionProps) {
  const documentLayoutStyle = {
    '--document-max-width': `${documentMaxWidth}px`
  } as CSSProperties;

  return (
    <section aria-label="Document area" className="panel-document-shell">
      <Panel
        ariaLabel="Document panel"
        actions={<NodeBreadcrumbs activeNodeId={activeNodeId} nodesById={nodesById} onSelectNode={onSelectNode} />}
        bodyClassName="editor-body"
        className="panel-editor"
        style={documentLayoutStyle}
        title="Document"
      >
        <div className="document-width-shell" data-resizing={isDocumentResizing}>
          <DocumentWidthHandle
            ariaLabel="Resize document width from left"
            onPointerDown={(event) => onStartDocumentResize('left', event)}
            onResetLayout={onResetLayout}
            side="left"
          />
          <div className="document-width-frame">
            <MarkdownEditor
              nodeId={editorNodeId}
              nodeViewState={editorNodeViewState}
              onChange={onEditorChange}
              onReady={onEditorReady}
              value={editorContent}
            />
          </div>
          <DocumentWidthHandle
            ariaLabel="Resize document width from right"
            onPointerDown={(event) => onStartDocumentResize('right', event)}
            onResetLayout={onResetLayout}
            side="right"
          />
        </div>
      </Panel>
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
