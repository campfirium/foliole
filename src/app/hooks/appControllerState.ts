import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useSaveActiveNodeView } from './appControllerSaveActiveNodeView';
import { requestReadingPositionApply } from './readingPositionRequests';
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
      isHydrated: state.isHydrated,
      createChildNode: state.createChildNode,
      createVirtualNode: state.createVirtualNode,
      createHighlightNodeFromSelection: state.createHighlightNodeFromSelection,
      createImageClozeNodes: state.createImageClozeNodes,
      createQANodeFromSelection: state.createQANodeFromSelection,
      createRootNode: state.createRootNode,
      deleteNode: state.deleteNode,
      deleteNodePermanently: state.deleteNodePermanently,
      deleteImageClozeRegion: state.deleteImageClozeRegion,
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

function useWorkspaceReadingProgressPersistence(args: {
  activeNodeId: string | null;
  editorRef: ReturnType<typeof useAppRuntime>['editorRef'];
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: ReturnType<typeof useWorkspaceSelectors>['nodeViewById'];
  readingPositionRef: ReturnType<typeof useAppRuntime>['readingPositionRef'];
  readingPositionSyncRef: ReturnType<typeof useAppRuntime>['readingPositionSyncRef'];
  setNodeViewState: ReturnType<typeof useWorkspaceSelectors>['setNodeViewState'];
}) {
  useReadingProgressSync({
    activeNodeId: args.activeNodeId,
    editorRef: args.editorRef,
    getReadingPositionSelection: () =>
      args.readingPositionRef.current.nodeId === args.activeNodeId ? args.readingPositionRef.current.selection : null,
    getReadingPositionSyncState: () =>
      args.readingPositionSyncRef.current.nodeId === args.activeNodeId ? args.readingPositionSyncRef.current.state : null,
    isViewingTrashNode: args.isViewingTrashNode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    nodeViewById: args.nodeViewById,
    setNodeViewState: args.setNodeViewState
  });
}

function useAnchorNavigationReadingPosition(runtime: ReturnType<typeof useAppRuntime>) {
  const beginAnchorNavigationRestore = useCallback(
    (nodeId: string, selection: { from: number; to: number }) => {
      requestReadingPositionApply({
        nodeId,
        reason: 'anchor-navigation',
        runtime,
        selection
      });
    },
    [runtime]
  );

  const completeAnchorNavigationRestore = useCallback(
    (nodeId: string, reason: string) => {
      void reason;
      const current = runtime.readingPositionSyncRef.current;
      if (current.nodeId !== nodeId || current.state?.reason !== 'anchor-navigation') {
        return;
      }
      runtime.readingPositionSyncRef.current = {
        nodeId,
        state: null
      };
    },
    [runtime.readingPositionSyncRef]
  );

  return {
    beginAnchorNavigationRestore,
    completeAnchorNavigationRestore
  };
}

function useWorkspaceEditorController(
  ws: ReturnType<typeof useWorkspaceSelectors>,
  runtime: ReturnType<typeof useAppRuntime>,
  activeNode: Node | undefined,
  saveActiveNodeView: ReturnType<typeof useSaveActiveNodeView>,
  anchorNavigationReadingPosition: ReturnType<typeof useAnchorNavigationReadingPosition>
) {
  const nav = useWorkspaceNavigation({
    activeNodeContent: activeNode?.content ?? null,
    activeNodeId: ws.activeNodeId,
    activeNodeParentId: activeNode?.parentNodeId ?? null,
    backStackSize: ws.navigation.backStack.length,
    beginAnchorNavigationRestore: anchorNavigationReadingPosition.beginAnchorNavigationRestore,
    closeContextMenu: () => undefined,
    completeAnchorNavigationRestore: anchorNavigationReadingPosition.completeAnchorNavigationRestore,
    editorRef: runtime.editorRef,
    flushPendingEditorDraft: runtime.flushPendingEditorDraft,
    forwardStackSize: ws.navigation.forwardStack.length,
    goBack: ws.goBack,
    goForward: ws.goForward,
    goToParent: ws.goToParent,
    jumpToAncestorNode: ws.jumpToAncestorNode,
    nodesById: ws.nodesById,
    openNode: ws.openNode,
    saveActiveNodeView
  });
  const editorCtx = useEditorContextCommands({
    activeNode,
    activeNodeId: ws.activeNodeId,
    createChildNode: ws.createChildNode,
    createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection,
    createImageClozeNodes: ws.createImageClozeNodes,
    createQANodeFromSelection: ws.createQANodeFromSelection,
    deleteNodePermanently: ws.deleteNodePermanently,
    deleteImageClozeRegion: ws.deleteImageClozeRegion,
    editorRef: runtime.editorRef,
    isTrashViewOpen: runtime.isViewingTrashNode,
    trashedNodeIds: ws.trashedNodeIds,
    nodesById: ws.nodesById,
    onExitImmersiveMode: () => runtime.setIsImmersiveMode(false),
    onSelectNode: (nodeId) => nav.handleSelectNode(nodeId),
    updateNodeContent: ws.updateNodeContent
  });
  return { editorCtx, nav };
}

function useEditorDraftCloseBridge(
  isWorkspaceHydrated: boolean,
  flushPendingEditorDraftImmediately: () => Promise<boolean>
) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    window.__folioleFlushPendingEditorDraftBeforeClose = flushPendingEditorDraftImmediately;
    return () => {
      if (window.__folioleFlushPendingEditorDraftBeforeClose === flushPendingEditorDraftImmediately) {
        delete window.__folioleFlushPendingEditorDraftBeforeClose;
      }
    };
  }, [flushPendingEditorDraftImmediately, isWorkspaceHydrated]);
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
  const anchorNavigationReadingPosition = useAnchorNavigationReadingPosition(runtime);
  const saveActiveNodeView = useSaveActiveNodeView(runtime, ws);
  const { editorCtx, nav } = useWorkspaceEditorController(
    ws,
    runtime,
    activeNode,
    saveActiveNodeView,
    anchorNavigationReadingPosition
  );
  useEditorDraftCloseBridge(isWorkspaceHydrated, runtime.flushPendingEditorDraftImmediately);
  useWorkspaceReadingProgressPersistence({
    activeNodeId: ws.activeNodeId,
    editorRef: runtime.editorRef,
    isViewingTrashNode: runtime.isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById: ws.nodeViewById,
    readingPositionRef: runtime.readingPositionRef,
    readingPositionSyncRef: runtime.readingPositionSyncRef,
    setNodeViewState: ws.setNodeViewState
  });
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
