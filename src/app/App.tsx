import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useDocumentWidthResizer } from './hooks/useDocumentWidthResizer';
import { useEditorContextCommands } from './hooks/useEditorContextCommands';
import { useListResizer } from './hooks/useListResizer';
import { useStudyMode } from './hooks/useStudyMode';
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
  const gradeReviewCard = useWorkspaceStore((state) => state.gradeReviewCard);
  const jumpToAncestorNode = useWorkspaceStore((state) => state.jumpToAncestorNode);
  const listWidth = useWorkspaceStore((state) => state.layout.listWidth);
  const navigation = useWorkspaceStore((state) => state.navigation);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodeViewById = useWorkspaceStore((state) => state.nodeViewById);
  const openNode = useWorkspaceStore((state) => state.openNode);
  const revealReviewAnswer = useWorkspaceStore((state) => state.revealReviewAnswer);
  const reviewSession = useWorkspaceStore((state) => state.reviewSession);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setDocumentMaxWidth = useWorkspaceStore((state) => state.setDocumentMaxWidth);
  const setListWidth = useWorkspaceStore((state) => state.setListWidth);
  const setNodeViewState = useWorkspaceStore((state) => state.setNodeViewState);
  const startReviewSession = useWorkspaceStore((state) => state.startReviewSession);
  const trashedNodeIds = useWorkspaceStore((state) => state.trashedNodeIds);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const updateNodeReveal = useWorkspaceStore((state) => state.updateNodeReveal);
  const exitReviewSession = useWorkspaceStore((state) => state.exitReviewSession);

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
  const { canStartStudyMode, isStudyMode, resetStudyMode, startStudyMode } = useStudyMode({
    activeNodeId,
    isViewingTrashNode
  });
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
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    if (isTrashViewOpen) {
      closeTrashView();
    } else {
      openTrashView();
    }
    closeContextMenu();
  };

  const handleOpenNotesView = () => {
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    closeTrashView();
    closeContextMenu();
  };

  const handleSelectNode = (nodeId: string) => {
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    handleSelectNoteNode(nodeId);
  };

  const handleSelectTrashNode = (nodeId: string) => {
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(true);
    openTrashView();
    setSelectedTrashNodeId(nodeId);
  };

  const handleSelectBreadcrumbNode = (nodeId: string) => {
    resetStudyMode();
    exitReviewSession();
    setIsViewingTrashNode(false);
    handleSelectBreadcrumbNodeRaw(nodeId);
  };

  const handleStartStudyMode = () => {
    const started = startReviewSession();
    if (!started) {
      return;
    }
    startStudyMode();
  };

  const handleRevealAnswer = () => {
    revealReviewAnswer();
  };

  const handleGradeReview = async (grade: ReviewGrade) => {
    const graded = await gradeReviewCard(grade);
    if (!graded) {
      return;
    }
    if (!useWorkspaceStore.getState().reviewSession.currentNodeId) {
      resetStudyMode();
    }
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
    if (!isStudyMode || reviewSession.currentNodeId) {
      return;
    }
    resetStudyMode();
  }, [isStudyMode, resetStudyMode, reviewSession.currentNodeId]);

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
      canStartStudyMode={canStartStudyMode}
      documentMaxWidth={documentMaxWidth}
      editorContent={editorContent}
      editorNodeId={editorNodeId}
      editorNodeViewState={activeNodeViewState}
      isStudyMode={isStudyMode}
      isDocumentResizing={documentResize.isResizingDocument}
      isResizingList={listResize.isResizingList}
      isTrashViewOpen={isTrashViewOpen}
      isViewingTrashNode={isViewingTrashNode}
      isAnswerRevealed={reviewSession.isAnswerRevealed}
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
      onGradeReview={handleGradeReview}
      onResetLayout={resetLayout}
      onRevealAnswer={handleRevealAnswer}
      onSelectBreadcrumbNode={handleSelectBreadcrumbNode}
      onSelectNode={handleSelectNode}
      onSelectTrashNode={handleSelectTrashNode}
      onSplitterKeyDown={listResize.handleSplitterKeyDown}
      onSplitterPointerDown={listResize.handleSplitterPointerDown}
      onStartDocumentResize={documentResize.startResize}
      onStartStudyMode={handleStartStudyMode}
      onOpenNotesView={handleOpenNotesView}
      onOpenTrashView={handleOpenTrashView}
      selectedTrashNodeId={selectedTrashNodeId}
      showAnswerSection={!isStudyMode || reviewSession.isAnswerRevealed}
    />
  );
}
