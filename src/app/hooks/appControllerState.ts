import { useCallback, useEffect, useState } from 'react';

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
  return {
    activeNodeId: useWorkspaceStore((state) => state.activeNodeId),
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    createHighlightNodeFromSelection: useWorkspaceStore((state) => state.createHighlightNodeFromSelection),
    createImageClozeNodes: useWorkspaceStore((state) => state.createImageClozeNodes),
    createQANodeFromSelection: useWorkspaceStore((state) => state.createQANodeFromSelection),
    createRootNode: useWorkspaceStore((state) => state.createRootNode),
    dismissReviewItem: useWorkspaceStore((state) => state.dismissReviewItem),
    documentMaxWidth: useWorkspaceStore((state) => state.layout.documentMaxWidth),
    completeReviewItem: useWorkspaceStore((state) => state.completeReviewItem),
    deferReviewItem: useWorkspaceStore((state) => state.deferReviewItem),
    goBack: useWorkspaceStore((state) => state.goBack),
    goForward: useWorkspaceStore((state) => state.goForward),
    goToParent: useWorkspaceStore((state) => state.goToParent),
    gradeReviewCard: useWorkspaceStore((state) => state.gradeReviewCard),
    jumpToAncestorNode: useWorkspaceStore((state) => state.jumpToAncestorNode),
    isListCollapsed: useWorkspaceStore((state) => state.layout.isListCollapsed),
    isRightSidebarCollapsed: useWorkspaceStore((state) => state.layout.isRightSidebarCollapsed),
    listWidth: useWorkspaceStore((state) => state.layout.listWidth),
    moveNode: useWorkspaceStore((state) => state.moveNode),
    navigation: useWorkspaceStore((state) => state.navigation),
    nodesById: useWorkspaceStore((state) => state.nodesById),
    nodeOrder: useWorkspaceStore((state) => state.nodeOrder),
    nodeViewById: useWorkspaceStore((state) => state.nodeViewById),
    openNode: useWorkspaceStore((state) => state.openNode),
    revealReviewAnswer: useWorkspaceStore((state) => state.revealReviewAnswer),
    reviewSession: useWorkspaceStore((state) => state.reviewSession),
    resetLayout: useWorkspaceStore((state) => state.resetLayout),
    setListCollapsed: useWorkspaceStore((state) => state.setListCollapsed),
    setDocumentMaxWidth: useWorkspaceStore((state) => state.setDocumentMaxWidth),
    setListWidth: useWorkspaceStore((state) => state.setListWidth),
    setRightSidebarCollapsed: useWorkspaceStore((state) => state.setRightSidebarCollapsed),
    setRightSidebarWidth: useWorkspaceStore((state) => state.setRightSidebarWidth),
    setNodeViewState: useWorkspaceStore((state) => state.setNodeViewState),
    startReviewSession: useWorkspaceStore((state) => state.startReviewSession),
    rightSidebarWidth: useWorkspaceStore((state) => state.layout.rightSidebarWidth),
    trashedNodeIds: useWorkspaceStore((state) => state.trashedNodeIds),
    updateNodeContent: useWorkspaceStore((state) => state.updateNodeContent),
    updateVirtualNodeFilter: useWorkspaceStore((state) => state.updateVirtualNodeFilter),
    updateNodeDesiredRetention: useWorkspaceStore((state) => state.updateNodeDesiredRetention),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
    updateNodeReveal: useWorkspaceStore((state) => state.updateNodeReveal),
    exitReviewSession: useWorkspaceStore((state) => state.exitReviewSession)
  };
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
  const nav = useWorkspaceNavigation({ activeNodeContent: activeNode?.content ?? null, activeNodeId: ws.activeNodeId, activeNodeParentId: activeNode?.parentNodeId ?? null, backStackSize: ws.navigation.backStack.length, closeContextMenu: () => undefined, editorRef: runtime.editorRef, forwardStackSize: ws.navigation.forwardStack.length, goBack: ws.goBack, goForward: ws.goForward, goToParent: ws.goToParent, jumpToAncestorNode: ws.jumpToAncestorNode, openNode: ws.openNode, saveActiveNodeView });
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
