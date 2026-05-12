import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';
import { mergeRuntimeReadwiseTopicHighlights } from '../../shared/platform/readwiseTopicMerge';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import { collectNodeSubtreeIds } from '../../store/workspaceHelpers';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { requestDocumentTopicSearchOpen } from '../components/documentTopicSearchEvents';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildPaletteState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
import { restartAppWithReadingProgress } from './appRestartPersistence';
import { clearSettingsRequest, openReadwiseReaderSettings } from './settingsOverlayRequest';
import type { useFormalImport } from './useFormalImport';

function createDirectNodeCommand(kind: 'folder' | 'topic' | 'item', args: {
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return () => {
    args.trash.closeTrashView();
    args.ws.createRootNode('', kind);
  };
}

function createVirtualNodeCommand(args: {
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return () => {
    args.trash.closeTrashView();
    args.ws.createVirtualNode();
  };
}

function createExportCurrentArticleCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    if (args.runtime.isViewingTrashNode || !args.ws.activeNodeId) {
      return false;
    }
    const result = await exportCurrentArticleMirror(args.ws.activeNodeId);
    return result?.status === 'saved';
  };
}

function createMergeHighlightsIntoTopicCommand(args: {
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    if (!args.ws.activeNodeId) {
      return false;
    }
    const result = await mergeRuntimeReadwiseTopicHighlights(args.ws.activeNodeId);
    if (!result || result.status === 'error') {
      window.alert('合并失败。');
      return false;
    }
    if (result.status === 'merged') {
      await useWorkspaceStore.persist.rehydrate();
    }
    return true;
  };
}

function createReimportSelectedTopicCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    if (!nodeId || args.runtime.isViewingTrashNode) {
      return false;
    }
    await args.runtime.flushPendingEditorDraftImmediately();
    const result = await devReimportSelectedTopic({
      nodeId,
      nodeIdsToDelete: collectNodeSubtreeIds(nodeId, args.ws.nodesById),
      nodeOrder: args.ws.nodeOrder
    });
    if (result.status !== 'reimported') {
      window.alert(result.detail);
      return false;
    }
    await useWorkspaceStore.persist.rehydrate();
    if (result.nodeId) {
      useWorkspaceStore.getState().openNode(result.nodeId);
    }
    return true;
  };
}

function createRestartAppCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return () => {
    const latestWorkspaceState = useWorkspaceStore.getState();
    restartAppWithReadingProgress({
      activeNodeId: latestWorkspaceState.activeNodeId,
      editorRef: args.runtime.editorRef,
      getReadingPositionSelection: () =>
        args.runtime.readingPositionRef.current.nodeId === latestWorkspaceState.activeNodeId
          ? args.runtime.readingPositionRef.current.selection
          : null,
      isImmersiveMode: args.runtime.isImmersiveMode,
      isViewingTrashNode: args.runtime.isViewingTrashNode,
      nodeViewById: latestWorkspaceState.nodeViewById,
      setNodeViewState: latestWorkspaceState.setNodeViewState
    });
  };
}

function createPaletteNavigationActions(args: {
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goParent: args.nav.handleGoParent,
    goToNode: () => undefined,
    moveToNode: () => undefined,
    renameNode: () => requestNodeRename(args.ws.activeNodeId)
  };
}

function createPaletteRunnerArgs(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  paletteItems: CommandPaletteItem[];
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    clearSettingsRequest: () => clearSettingsRequest(args.runtime),
    closeTrashView: args.trash.closeTrashView,
    completeReviewItem: args.ws.completeReviewItem,
    createFolder: createDirectNodeCommand('folder', args),
    createItem: createDirectNodeCommand('item', args),
    createTopic: createDirectNodeCommand('topic', args),
    createVirtualNode: createVirtualNodeCommand(args),
    enterPriorityMode: args.layoutProps.document.onEnterPriorityQuickSet,
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.study.exitStudyMode,
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    findInTopic: requestDocumentTopicSearchOpen,
    mergeHighlightsIntoTopic: createMergeHighlightsIntoTopicCommand({ ws: args.ws }),
    ...createPaletteNavigationActions(args),
    gradeReviewCard: args.ws.gradeReviewCard,
    importDirectory: args.formalImport.startImportDirectory,
    importSingleFile: args.formalImport.startImportFile,
    isReviewMode: args.isStudyMode,
    onRestartApp: createRestartAppCommand(args),
    onToggleBaseColorMode: args.appearance.toggleBaseColorMode,
    onToggleDevTools: toggleMainWindowDevTools,
    onToggleEditorDisplayMode: args.appearance.toggleEditorDisplayMode,
    onToggleImmersiveMode: args.layoutProps.layoutChrome.onToggleImmersiveMode,
    onToggleListVisibility: args.layoutProps.layoutChrome.onToggleListVisibility,
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    openReadwiseReaderSettings: () => openReadwiseReaderSettings(args.runtime),
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    reimportSelectedTopic: createReimportSelectedTopicCommand(args),
    resetImportData: args.formalImport.resetImportData,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen: args.runtime.setIsMoveToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startClipboardImport: args.layoutProps.imports.onStartClipboardImport,
    startReviewSession: args.ws.startReviewSession,
    startStudyMode: args.study.startStudyMode,
    trashViewOpen: args.trash.isTrashViewOpen
  };
}

export function buildControllerPaletteState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  paletteItems: CommandPaletteItem[];
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runPaletteCommand = createPaletteCommandRunner(createPaletteRunnerArgs(args));

  return buildPaletteState(
    args.runtime.isCommandPaletteOpen,
    args.paletteItems,
    args.runtime.recentCommandIds,
    () => args.runtime.setIsCommandPaletteOpen(false),
    runPaletteCommand
  );
}
