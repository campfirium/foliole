import { useEffect, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { isInboxNode } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { definedProps } from '../../shared/lib/definedProps';

import {
  useActiveNodeReadingPositionRestore,
  useNavigationReadingPosition
} from './appControllerNavigationReadingPosition';
import { useSaveActiveNodeView } from './appControllerSaveActiveNodeView';
import { useWorkspaceSelectors } from './appWorkspaceSelectors';
import { useAppRuntime } from './useAppRuntime';
import { useEditorContextCommands } from './useEditorContextCommands';
import { useExternalLibraryView } from './useExternalLibraryView';
import { useListResizer } from './useListResizer';
import { useReadingProgressSync } from './useReadingProgressSync';
import { useRemovedSourcesWarmup } from './useRemovedSourcesWarmup';
import { useRightSidebarResizer } from './useRightSidebarResizer';
import { useStudyMode } from './useStudyMode';
import { useTrashView } from './useTrashView';
import { useVirtualNodeView } from './useVirtualNodeView';
import { useWorkspaceActiveNodeDocument } from './useWorkspaceActiveNodeDocument';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';

export { useWorkspaceSelectors };

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
  const { selectionToolbarEnabled } = useAppearanceSettings();
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
    selectionToolbarEnabled,
    updateNodeContent: ws.updateNodeContent,
    ...definedProps({ activeNode })
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
  const trash = useTrashView({ trashedNodeIds: ws.trashedNodeIds });
  useWorkspaceActiveNodeDocument(ws.activeNodeId);
  useWorkspaceActiveNodeDocument(trash.selectedTrashNodeId, { keepWarm: true });
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const virtualView = useVirtualNodeView();
  const externalView = useExternalLibraryView();
  useRemovedSourcesWarmup(isWorkspaceHydrated);
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const runtime = useAppRuntime(ws.listWidth, ws.rightSidebarWidth);
  const study = useStudyMode({
    activeNodeId: isInboxNode(activeNode) ? null : ws.activeNodeId,
    isViewingTrashNode: runtime.isViewingTrashNode
  });
  const listResize = useListResizer(ws.listWidth, ws.setListWidth);
  const rightSidebarResize = useRightSidebarResizer(ws.rightSidebarWidth, ws.setRightSidebarWidth);
  const navigationReadingPosition = useNavigationReadingPosition(runtime, ws.nodeViewById, ws.setNodeViewState);
  useActiveNodeReadingPositionRestore(runtime, ws.activeNodeId, ws.nodeViewById, isWorkspaceHydrated);
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
