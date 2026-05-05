import { useCallback, useEffect, useRef } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { useWorkspaceStore } from '../store/workspaceStore';

import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useListResizer } from './hooks/useListResizer';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const documentMaxWidth = useWorkspaceStore((state) => state.layout.documentMaxWidth);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setNodeViewState = useWorkspaceStore((state) => state.setNodeViewState);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const editorRef = useRef<EditorAdapter | null>(null);

  const listResize = useListResizer(listWidth, setListWidth);
  const documentResize = useDocumentWidthResizer(documentMaxWidth, setDocumentMaxWidth);
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';
  const activeNodeViewState = activeNodeId ? nodeViewById[activeNodeId] : undefined;

  const saveActiveNodeView = useCallback(() => {
    if (!activeNodeId || !editorRef.current) {
      return;
    }

    setNodeViewState(activeNodeId, {
      scrollTop: editorRef.current.getScrollTop(),
      selection: editorRef.current.getSelection()
    });
  }, [activeNodeId, setNodeViewState]);

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  };

  const handleSelectNode = (nodeId: string) => {
    saveActiveNodeView();
    setActiveNode(nodeId);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveActiveNodeView();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveActiveNodeView();
    };
  }, [saveActiveNodeView]);

  return (
    <WorkspaceLayout
      activeNodeId={activeNodeId}
      documentMaxWidth={documentMaxWidth}
      editorContent={editorContent}
      editorNodeId={activeNodeId}
      editorNodeViewState={activeNodeViewState}
      isDocumentResizing={documentResize.isResizingDocument}
      isResizingList={listResize.isResizingList}
      listWidth={listWidth}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onEditorChange={handleEditorChange}
      onEditorReady={handleEditorReady}
      onResetLayout={resetLayout}
      onStartDocumentResize={documentResize.startResize}
      onSelectNode={handleSelectNode}
      onSplitterKeyDown={listResize.handleSplitterKeyDown}
      onSplitterPointerDown={listResize.handleSplitterPointerDown}
    />
  );
}
