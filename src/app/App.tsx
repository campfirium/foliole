import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { useWorkspaceStore } from '../store/workspaceStore';

import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useEditorContextCommands } from './hooks/useEditorContextCommands';
import { useListResizer } from './hooks/useListResizer';
import { useTrashView } from './hooks/useTrashView';
import { useWorkspaceNavigation } from './hooks/useWorkspaceNavigation';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const createHighlightNodeFromSelection = useWorkspaceStore((state) => state.createHighlightNodeFromSelection);
  const createQANodeFromSelection = useWorkspaceStore((state) => state.createQANodeFromSelection);
  const createRootNode = useWorkspaceStore((state) => state.createRootNode);
  const documentMaxWidth = useWorkspaceStore((state) => state.layout.documentMaxWidth);
  const goBack = useWorkspaceStore((state) => state.goBack);
  const goForward = useWorkspaceStore((state) => state.goForward);
  const goToParent = useWorkspaceStore((state) => state.goToParent);
  const jumpToAncestorNode = useWorkspaceStore((state) => state.jumpToAncestorNode);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const navigation = useWorkspaceStore((state) => state.navigation);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const openNode = useWorkspaceStore((state) => state.openNode);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const setNodeViewState = useWorkspaceStore((state) => state.setNodeViewState);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const updateNodeReveal = useWorkspaceStore((state) => state.updateNodeReveal);

  const editorRef = useRef<EditorAdapter | null>(null);

  const listResize = useListResizer(listWidth, setListWidth);
  const documentResize = useDocumentWidthResizer(documentMaxWidth, setDocumentMaxWidth);
  const {
    closeTrashView,
    isTrashViewOpen,
    openTrashView,
    selectedTrashNodeId,
    setSelectedTrashNodeId
  } = useTrashView({
    nodeOrder,
    trashedNodeIds
  });
  const [isViewingTrashNode, setIsViewingTrashNode] = useState(false);
  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const selectedTrashNode = selectedTrashNodeId ? nodesById[selectedTrashNodeId] : undefined;
  const documentNode = isViewingTrashNode ? selectedTrashNode : activeNode;
  const editorContent = documentNode?.content ?? '';
  const editorNodeId = isViewingTrashNode ? null : activeNodeId;
  const activeNodeViewState = !isViewingTrashNode && activeNodeId ? nodeViewById[activeNodeId] : undefined;
  const { closeContextMenu, contextMenu, handleCreateCloze, handleCreateHighlight, handleEditorContextMenu } =
    useEditorContextCommands({
      activeNode,
      activeNodeId,
      createHighlightNodeFromSelection,
      createQANodeFromSelection,
      editorRef,
      isTrashViewOpen: isViewingTrashNode,
      updateNodeContent
    });

  const saveActiveNodeView = useCallback(() => {
    if (isViewingTrashNode || !activeNodeId || !editorRef.current) {
      return;
    }

    setNodeViewState(activeNodeId, {
      scrollTop: editorRef.current.getScrollTop(),
      selection: editorRef.current.getSelection()
    });
  }, [activeNodeId, isViewingTrashNode, setNodeViewState]);

  const {
    canGoBack,
    canGoForward,
    canGoParent,
    handleGoBack,
    handleGoForward,
    handleGoParent,
    handleSelectBreadcrumbNode: handleSelectBreadcrumbNodeRaw,
    handleSelectNode: handleSelectNoteNode
  } = useWorkspaceNavigation({
    activeNodeContent: activeNode?.content ?? null,
    activeNodeId,
    activeNodeParentId: activeNode?.parentNodeId ?? null,
    backStackSize: navigation.backStack.length,
    closeContextMenu,
    editorRef,
    forwardStackSize: navigation.forwardStack.length,
    goBack,
    goForward,
    goToParent,
    jumpToAncestorNode,
    openNode,
    saveActiveNodeView
  });

  const handleEditorChange = (content: string) => {
    if (isViewingTrashNode) {
      return;
    }
    if (!activeNode) {
      createRootNode(content);
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  const handleEditorReady = (adapter: EditorAdapter | null) => {
    editorRef.current = adapter;
  };

  const handleAnswerChange = (answer: string) => {
    if (isViewingTrashNode || !activeNodeId) {
      return;
    }
    updateNodeReveal(activeNodeId, answer);
  };

  const handleOpenTrashView = () => {
    setIsViewingTrashNode(false);
    if (isTrashViewOpen) {
      closeTrashView();
    } else {
      openTrashView();
    }
    closeContextMenu();
  };

  const handleOpenNotesView = () => {
    setIsViewingTrashNode(false);
    if (isTrashViewOpen) {
      closeTrashView();
    } else {
      openTrashView();
    }
    closeContextMenu();
  };

  const handleSelectNode = (nodeId: string) => {
    setIsViewingTrashNode(false);
    handleSelectNoteNode(nodeId);
  };

  const handleSelectTrashNode = (nodeId: string) => {
    setIsViewingTrashNode(true);
    openTrashView();
    setSelectedTrashNodeId(nodeId);
  };

  const handleSelectBreadcrumbNode = (nodeId: string) => {
    setIsViewingTrashNode(false);
    handleSelectBreadcrumbNodeRaw(nodeId);
  };

  useEffect(() => {
    if (!isViewingTrashNode) {
      return;
    }
    if (!isTrashViewOpen || !selectedTrashNodeId || !trashedNodeIds.includes(selectedTrashNodeId)) {
      setIsViewingTrashNode(false);
    }
  }, [isTrashViewOpen, isViewingTrashNode, selectedTrashNodeId, trashedNodeIds]);

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

  useEffect(() => {
    const disableNativeContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', disableNativeContextMenu);
    return () => {
      window.removeEventListener('contextmenu', disableNativeContextMenu);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <WorkspaceLayout
      activeNodeId={activeNodeId}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      canGoParent={canGoParent}
      contextMenu={contextMenu}
      documentMaxWidth={documentMaxWidth}
      editorContent={editorContent}
      editorNodeId={editorNodeId}
      editorNodeViewState={activeNodeViewState}
      isDocumentResizing={documentResize.isResizingDocument}
      isResizingList={listResize.isResizingList}
      isTrashViewOpen={isTrashViewOpen}
      isViewingTrashNode={isViewingTrashNode}
      listWidth={listWidth}
      nodeOrder={nodeOrder}
      nodesById={nodesById}
      onAnswerChange={handleAnswerChange}
      onCloseContextMenu={closeContextMenu}
      onCreateCloze={handleCreateCloze}
      onCreateHighlight={handleCreateHighlight}
      onEditorChange={handleEditorChange}
      onEditorContextMenu={handleEditorContextMenu}
      onEditorReady={handleEditorReady}
      onGoBack={handleGoBack}
      onGoForward={handleGoForward}
      onGoParent={handleGoParent}
      onResetLayout={resetLayout}
      onSelectBreadcrumbNode={handleSelectBreadcrumbNode}
      onSelectNode={handleSelectNode}
      onSelectTrashNode={handleSelectTrashNode}
      onSplitterKeyDown={listResize.handleSplitterKeyDown}
      onSplitterPointerDown={listResize.handleSplitterPointerDown}
      onStartDocumentResize={documentResize.startResize}
      onOpenNotesView={handleOpenNotesView}
      onOpenTrashView={handleOpenTrashView}
      selectedTrashNodeId={selectedTrashNodeId}
    />
  );
}
