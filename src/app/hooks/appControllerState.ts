import { useEffect, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_PUBLISHED_NODE_ID } from '../../features/nodes/model/specialNodes';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { definedProps } from '../../shared/lib/definedProps';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { subscribeOpenFoliolePublishedTopics } from '../../shared/platform/foliolePublishedNavigation';
import { getDemoRuntimeNowIso, subscribeDemoRuntimeState, useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { buildStartReviewSessionQueue } from '../../store/workspaceReviewLiveQueue';

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

type WorkspaceControllerStateInput = ReturnType<typeof useWorkspaceSelectors>;

export function useNowIso(tickMs = 15_000) {
  const [nowIso, setNowIso] = useState(() => getDemoRuntimeNowIso());
  useEffect(() => {
    const updateNow = () => setNowIso(getDemoRuntimeNowIso());
    const timer = window.setInterval(updateNow, tickMs);
    const unsubscribeDemoRuntime = subscribeDemoRuntimeState(updateNow);
    return () => {
      window.clearInterval(timer);
      unsubscribeDemoRuntime();
    };
  }, [tickMs]);
  return nowIso;
}

function useReviewStartBlockedNotice(isReviewSchedulerSettingsReady: boolean) {
  const t = useTranslation();
  if (!isReviewSchedulerSettingsReady) {
    return undefined;
  }
  return () => showAppRuntimeNotice(t('desktop.reviewSession.allClear.notice'), 'success');
}

function resolveCanStartStudyMode(args: {
  isDemo: boolean;
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
  ws: WorkspaceControllerStateInput;
}) {
  return args.isReviewSchedulerSettingsReady && buildStartReviewSessionQueue(args.ws, args.nowIso, {
    includeScheduledFallback: args.isDemo
  }).length > 0;
}

function useWorkspaceStudyModeState(args: {
  isReviewSchedulerSettingsReady: boolean;
  nowIso: string;
  ws: WorkspaceControllerStateInput;
}) {
  const demoRuntime = useDemoRuntimeState();
  const canStartStudyMode = resolveCanStartStudyMode({
    isDemo: demoRuntime.isDemo,
    isReviewSchedulerSettingsReady: args.isReviewSchedulerSettingsReady,
    nowIso: args.nowIso,
    ws: args.ws
  });
  return useStudyMode({
    canStartStudyMode,
    onBlockedStart: useReviewStartBlockedNotice(args.isReviewSchedulerSettingsReady)
  });
}

function useWorkspaceReadingProgressPersistence(args: {
  activeNodeId: string | null;
  browseRootNodeId: string;
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
    browseRootNodeId: args.browseRootNodeId,
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
  ws: WorkspaceControllerStateInput,
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
    flushActiveEditorTransaction: runtime.flushActiveEditorTransaction,
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
    createFormulaClozeNode: ws.createFormulaClozeNode,
    createHighlightNodeFromSelection: ws.createHighlightNodeFromSelection,
    createImageClozeNodes: ws.createImageClozeNodes,
    createQANodeFromSelection: ws.createQANodeFromSelection,
    deleteEditorAnnotationNodes: ws.deleteEditorAnnotationNodes,
    deleteImageClozeRegion: ws.deleteImageClozeRegion,
    editorRef: runtime.editorRef,
    flushPendingEditorDraft: runtime.flushPendingEditorDraft,
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

function usePublishedTopicsNavigation(
  runtime: ReturnType<typeof useAppRuntime>,
  virtualView: ReturnType<typeof useVirtualNodeView>
) {
  useEffect(() => subscribeOpenFoliolePublishedTopics(() => {
    runtime.setIsSettingsOpen(false);
    virtualView.openVirtualView(VIRTUAL_PUBLISHED_NODE_ID);
  }), [runtime.setIsSettingsOpen, virtualView.openVirtualView]);
}

function useWorkspaceActiveDocuments(activeNodeId: string | null, selectedTrashNodeId: string | null) {
  useWorkspaceActiveNodeDocument(activeNodeId);
  useWorkspaceActiveNodeDocument(selectedTrashNodeId, { includeTrashed: true, keepWarm: true });
}

export function useWorkspaceControllerState(
  ws: WorkspaceControllerStateInput,
  isWorkspaceHydrated: boolean,
  nowIso = new Date().toISOString(),
  isReviewSchedulerSettingsReady = true
) {
  const trash = useTrashView({ trashedNodeIds: ws.trashedNodeIds });
  useWorkspaceActiveDocuments(ws.activeNodeId, trash.selectedTrashNodeId);
  const activeNode = ws.activeNodeId ? ws.nodesById[ws.activeNodeId] : undefined;
  const browseRootNode = ws.nodesById[ws.browseRootNodeId];
  const virtualView = useVirtualNodeView({
    browseRootNodeId: ws.browseRootNodeId,
    browseRootSpecialKind: browseRootNode?.specialKind,
    setBrowseRootNode: ws.setBrowseRootNode
  });
  const externalView = useExternalLibraryView();
  useRemovedSourcesWarmup(isWorkspaceHydrated);
  const selectedTrashNode = trash.selectedTrashNodeId ? ws.nodesById[trash.selectedTrashNodeId] : undefined;
  const runtime = useAppRuntime(ws.listWidth, ws.rightSidebarWidth);
  usePublishedTopicsNavigation(runtime, virtualView);
  const study = useWorkspaceStudyModeState({ isReviewSchedulerSettingsReady, nowIso, ws });
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
    browseRootNodeId: ws.browseRootNodeId,
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
