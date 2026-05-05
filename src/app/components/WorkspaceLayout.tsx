import type { CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { NodeListTree } from '../../features/nodes/components/NodeListTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ResizeSide } from '../hooks/useDocumentWidthResizer';

import { DocumentPanelSection } from './DocumentPanelSection';
import { WorkspaceToolbar } from './WorkspaceToolbar';

export interface WorkspaceEditorContextMenu {
  canRunCommands: boolean;
  left: number;
  top: number;
}

export interface WorkspaceLayoutProps {
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
  isResizingList: boolean;
  isTrashViewOpen: boolean;
  isViewingTrashNode: boolean;
  listWidth: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onAnswerChange: (answer: string) => void;
  onEditorChange: (content: string) => void;
  onEditorReady: (adapter: EditorAdapter | null) => void;
  onEditorContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetLayout: () => void;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggleTrashView: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoParent: () => void;
  onCloseContextMenu: () => void;
  onCreateHighlight: () => void;
  onCreateCloze: () => void;
  onStartDocumentResize: (
    side: ResizeSide,
    event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>
  ) => void;
  selectedTrashNodeId: string | null;
}

export function WorkspaceLayout({
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
  isResizingList,
  isTrashViewOpen,
  isViewingTrashNode,
  listWidth,
  nodeOrder,
  nodesById,
  onAnswerChange,
  onEditorChange,
  onEditorReady,
  onEditorContextMenu,
  onResetLayout,
  onSelectBreadcrumbNode,
  onSelectNode,
  onSelectTrashNode,
  onSplitterKeyDown,
  onSplitterPointerDown,
  onToggleTrashView,
  onGoBack,
  onGoForward,
  onGoParent,
  onCloseContextMenu,
  onCreateHighlight,
  onCreateCloze,
  onStartDocumentResize,
  selectedTrashNodeId
}: WorkspaceLayoutProps) {
  const workspaceGridStyle = {
    '--workspace-list-width': `${listWidth}px`
  } as CSSProperties;
  const documentNodeId = isViewingTrashNode ? selectedTrashNodeId : activeNodeId;

  return (
    <main aria-label="Foliole workspace" className="workspace-shell">
      <WorkspaceToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoParent={canGoParent}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onGoParent={onGoParent}
      />
      <div className="workspace-grid" data-resizing={isResizingList} style={workspaceGridStyle}>
        <NodeListTree
          activeNodeId={activeNodeId}
          isTrashViewOpen={isTrashViewOpen}
          nodeOrder={nodeOrder}
          nodesById={nodesById}
          onSelectNode={onSelectNode}
          onSelectTrashNode={onSelectTrashNode}
          onToggleTrashView={onToggleTrashView}
          selectedTrashNodeId={selectedTrashNodeId}
        />
        <ListSplitter
          listWidth={listWidth}
          onResetLayout={onResetLayout}
          onSplitterKeyDown={onSplitterKeyDown}
          onSplitterPointerDown={onSplitterPointerDown}
        />
        <DocumentPanelSection
          activeNodeId={documentNodeId}
          contextMenu={contextMenu}
          documentMaxWidth={documentMaxWidth}
          editorContent={editorContent}
          editorNodeId={editorNodeId}
          editorNodeViewState={editorNodeViewState}
          isDocumentResizing={isDocumentResizing}
          nodesById={nodesById}
          onAnswerChange={onAnswerChange}
          onCloseContextMenu={onCloseContextMenu}
          onCreateCloze={onCreateCloze}
          onCreateHighlight={onCreateHighlight}
          onEditorChange={onEditorChange}
          onEditorContextMenu={onEditorContextMenu}
          onEditorReady={onEditorReady}
          onResetLayout={onResetLayout}
          onSelectNode={onSelectBreadcrumbNode}
          onStartDocumentResize={onStartDocumentResize}
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
