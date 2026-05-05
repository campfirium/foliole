import { useWorkspaceStore } from '../store/workspaceStore';

import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useListResizer } from './hooks/useListResizer';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const documentMaxWidth = useWorkspaceStore((state) => state.layout.documentMaxWidth);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);

  const listResize = useListResizer(listWidth, setListWidth);
  const documentResize = useDocumentWidthResizer(documentMaxWidth, setDocumentMaxWidth);
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  return (
    <WorkspaceLayout
      activeNodeId={activeNodeId}
      documentMaxWidth={documentMaxWidth}
      editorContent={editorContent}
      isDocumentResizing={documentResize.isResizingDocument}
      isResizingList={listResize.isResizingList}
      listWidth={listWidth}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onEditorChange={handleEditorChange}
      onResetLayout={resetLayout}
      onStartDocumentResize={documentResize.startResize}
      onSelectNode={setActiveNode}
      onSplitterKeyDown={listResize.handleSplitterKeyDown}
      onSplitterPointerDown={listResize.handleSplitterPointerDown}
    />
  );
}
