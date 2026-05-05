import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useAppRuntime } from './useAppRuntime';
import { useDocumentWidthResizer } from './useDocumentWidthResizer';
import { useEditorContextCommands } from './useEditorContextCommands';
import { useListResizer } from './useListResizer';
import { useReadingProgressSync } from './useReadingProgressSync';
import { useRightSidebarResizer } from './useRightSidebarResizer';
import { useStudyMode } from './useStudyMode';
import { useTrashView } from './useTrashView';
import { useVirtualNodeView } from './useVirtualNodeView';
import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';

export function useWorkspaceSelectors() {
  return useWorkspaceStore(
    useShallow((state) => ({
      activeNodeId: state.activeNodeId,
      createChildNode: state.createChildNode,
      createVirtualNode: state.createVirtualNode,
      createHighlightNodeFromSelection: state.createHighlightNodeFromSelection,
      createImageClozeNodes: state.createImageClozeNodes,
      createQANodeFromSelection: state.createQANodeFromSelection,
      createRootNode: state.createRootNode,
      dismissReviewItem: state.dismissReviewItem,
      documentMaxWidth: state.layout.documentMaxWidth,
      completeReviewItem: state.completeReviewItem,
      deferReviewItem: state.deferReviewItem,
      goBack: state.goBack,
      goForward: state.goForward,
      goToParent: state.goToParent,
      gradeReviewCard: state.gradeReviewCard,
      jumpToAncestorNode: state.jumpToAncestorNode,
      isListCollapsed: state.layout.isListCollapsed,
      isRightSidebarCollapsed: state.layout.isRightSidebarCollapsed,
      listWidth: state.layout.listWidth,
      moveNode: state.moveNode,
      navigation: state.navigation,
      nodesById: state.nodesById,
      nodeOrder: state.nodeOrder,
      nodeViewById: state.nodeViewById,
      openNode: state.openNode,
      revealReviewAnswer: state.revealReviewAnswer,
      reviewSession: state.reviewSession,
      resetLayout: state.resetLayout,
      setListCollapsed: state.setListCollapsed,
      setDocumentMaxWidth: state.setDocumentMaxWidth,
      setListWidth: state.setListWidth,
      setRightSidebarCollapsed: state.setRightSidebarCollapsed,
      setRightSidebarWidth: state.setRightSidebarWidth,
      setNodeViewState: state.setNodeViewState,
      startReviewSession: state.startReviewSession,
      rightSidebarWidth: state.layout.rightSidebarWidth,
      trashedNodeIds: state.trashedNodeIds,
      updateNodeContent: state.updateNodeContent,
      updateVirtualNodeFilter: state.updateVirtualNodeFilter,
      updateNodeDesiredRetention: state.updateNodeDesiredRetention,
      updateNodePriority: state.updateNodePriority,
      updateNodeReveal: state.updateNodeReveal,
      exitReviewSession: state.exitReviewSession
    }))
  );
}

export function useNowIso(tickMs = 15_000) {
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(new Date().toISOString()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return nowIso;
}

export function useWorkspaceControllerState(
  ws: ReturnType<typeof useWorkspaceSelectors>,
  isWorkspaceHydrated: boolean
) {
  useWorkspaceActiveNodeDocument(ws.activeNodeId);
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  const virtualView = useVirtualNodeView();
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const study = useStudyMode({
    activeNodeId: isInboxNode(activeNode) ? null : ws.activeNodeId,
    isViewingTrashNode: false
  });
  const runtime = useAppRuntime(ws.listWidth, ws.rightSidebarWidth);
  const listResize = useListResizer(ws.listWidth, ws.setListWidth);
  const documentResize = useDocumentWidthResizer(ws.documentMaxWidth, ws.setDocumentMaxWidth);
  const rightSidebarResize = useRightSidebarResizer(ws.rightSidebarWidth, ws.setRightSidebarWidth);
  const saveActiveNodeView = useCallback(() => {
    if (runtime.isViewingTrashNode || !ws.activeNodeId || !runtime.editorRef.current) {
      return;
    }
    ws.setNodeViewState(ws.activeNodeId, { scrollTop: runtime.editorRef.current.getScrollTop(), selection: runtime.editorRef.current.getSelection() });
  }, [runtime.editorRef, runtime.isViewingTrashNode, ws]);
  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, nodesById: ws.nodesById, openNode: ws.openNode, saveActiveNodeView });
  const editorCtx = useEditorContextCommands({
    activeNode,
    activeNodeId: ws.activeNodeId,
    createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection,
    createImageClozeNodes: ws.createImageClozeNodes,
    createQANodeFromSelection: ws.createQANodeFromSelection,
    editorRef: runtime.editorRef,
    isTrashViewOpen: runtime.isViewingTrashNode,
    updateNodeContent: ws.updateNodeContent
  });
  useReadingProgressSync({ activeNodeId: ws.activeNodeId, editorRef: runtime.editorRef, isViewingTrashNode: runtime.isViewingTrashNode, isWorkspaceHydrated, nodeViewById: ws.nodeViewById, setNodeViewState: ws.setNodeViewState });
  return {
    activeNode,
    documentResize,
    editorCtx,
    listResize,
    nav,
    rightSidebarResize,
    runtime,
    selectedTrashNode,
    study,
    trash,
    virtualView
  };
}
