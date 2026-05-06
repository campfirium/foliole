import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useWorkspaceLayoutState } from '../../store/workspaceLayoutDomain';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useNavigationReadingPosition } from './appControllerNavigationReadingPosition';
import { useSaveActiveNodeView } from './appControllerSaveActiveNodeView';
import { useAppRuntime } from './useAppRuntime';
import { useEditorContextCommands } from './useEditorContextCommands';
import { useExternalLibraryView } from './useExternalLibraryView';
import { useListResizer } from './useListResizer';
import { useReadingProgressSync } from './useReadingProgressSync';
import { useRightSidebarResizer } from './useRightSidebarResizer';
import { useStudyMode } from './useStudyMode';
import { useTrashView } from './useTrashView';
import { useVirtualNodeView } from './useVirtualNodeView';
import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';

export function useWorkspaceSelectors() {
  const ws = useWorkspaceStore(
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
      completeReviewItem: state.completeReviewItem,
      deferReviewItem: state.deferReviewItem,
      goBack: state.goBack,
      goForward: state.goForward,
      goToParent: state.goToParent,
      gradeReviewCard: state.gradeReviewCard,
      jumpToAncestorNode: state.jumpToAncestorNode,
      moveNode: state.moveNode,
      navigation: state.navigation,
      nodesById: state.nodesById,
      nodeOrder: state.nodeOrder,
      nodeViewById: state.nodeViewById,
      openNode: state.openNode,
      revealReviewAnswer: state.revealReviewAnswer,
      reviewSession: state.reviewSession,
      setNodeViewState: state.setNodeViewState,
      startReviewSession: state.startReviewSession,
      trashedNodeIds: state.trashedNodeIds,
      updateNodeContent: state.updateNodeContent,
      updateVirtualNodeFilter: state.updateVirtualNodeFilter,
      updateNodeDesiredRetention: state.updateNodeDesiredRetention,
      updateNodePriority: state.updateNodePriority,
      updateNodeReveal: state.updateNodeReveal,
      exitReviewSession: state.exitReviewSession
    }))
  );
  const layout = useWorkspaceLayoutState();
  return { ...ws, ...layout };
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
  isImmersiveMode: boolean;
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
    isImmersiveMode: args.isImmersiveMode,
    isViewingTrashNode: args.isViewingTrashNode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    nodeViewById: args.nodeViewById,
    setNodeViewState: args.setNodeViewState
  });
}

function useWorkspaceEditorController(
  ws: ReturnType<typeof useWorkspaceSelectors>,
  runtime: ReturnType<typeof useAppRuntime>,
  activeNode: Node | undefined,
  saveActiveNodeView: ReturnType<typeof useSaveActiveNodeView>,
  navigationReadingPosition: ReturnType<typeof useNavigationReadingPosition>
) {
  const nav = useWorkspaceNavigation({
    activeNodeContent: activeNode?.content ?? null,
    activeNodeId: ws.activeNodeId,
    activeNodeParentId: activeNode?.parentNodeId ?? null,
    applyNavigationReadingPosition: navigationReadingPosition.applyNavigationReadingPosition,
    backStackSize: ws.navigation.backStack.length,
    closeContextMenu: () => undefined,
    editorRef: runtime.editorRef,
    flushPendingEditorDraft: runtime.flushPendingEditorDraft,
    flushPendingEditorDraftImmediately: runtime.flushPendingEditorDraftImmediately,
    forwardStackSize: ws.navigation.forwardStack.length,
    goBack: ws.goBack,
    goForward: ws.goForward,
    goToParent: ws.goToParent,
    jumpToAncestorNode: ws.jumpToAncestorNode,
    nodesById: ws.nodesById,
    nodeViewById: ws.nodeViewById,
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

function useEditorDraftCloseFlushRegistration(
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
  const trash = useTrashView({ nodeOrder: ws.nodeOrder, trashedNodeIds: ws.trashedNodeIds });
  useWorkspaceActiveNodeDocument(ws.activeNodeId);
  useWorkspaceActiveNodeDocument(trash.selectedTrashNodeId, { keepWarm: true });
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const virtualView = useVirtualNodeView();
  const externalView = useExternalLibraryView();
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const runtime = useAppRuntime(ws.listWidth, ws.rightSidebarWidth);
  const study = useStudyMode({
    activeNodeId: isInboxNode(activeNode) ? null : ws.activeNodeId,
    isViewingTrashNode: runtime.isViewingTrashNode
  });
  const listResize = useListResizer(ws.listWidth, ws.setListWidth);
  const rightSidebarResize = useRightSidebarResizer(ws.rightSidebarWidth, ws.setRightSidebarWidth);
  const navigationReadingPosition = useNavigationReadingPosition(runtime, ws.nodeViewById, ws.setNodeViewState);
  const saveActiveNodeView = useSaveActiveNodeView(runtime, ws);
  const { editorCtx, nav } = useWorkspaceEditorController(
    ws,
    runtime,
    activeNode,
    saveActiveNodeView,
    navigationReadingPosition
  );
  useEditorDraftCloseFlushRegistration(isWorkspaceHydrated, runtime.flushPendingEditorDraftImmediately);
  useWorkspaceReadingProgressPersistence({
    activeNodeId: ws.activeNodeId,
    editorRef: runtime.editorRef,
    isImmersiveMode: runtime.isImmersiveMode,
    isViewingTrashNode: runtime.isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById: ws.nodeViewById,
    readingPositionRef: runtime.readingPositionRef,
    readingPositionSyncRef: runtime.readingPositionSyncRef,
    setNodeViewState: ws.setNodeViewState
  });
  return {
    activeNode,
    editorCtx,
    listResize,
    nav,
    rightSidebarResize,
    runtime,
    selectedTrashNode,
    study,
    trash,
    externalView,
    virtualView
  };
}
