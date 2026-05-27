import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';
import { mergeRuntimeReadwiseTopicHighlights } from '../../shared/platform/readwiseTopicMerge';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { requestToggleDismissedTopicVisibility } from '../components/dismissedTopicVisibilitySetting';
import { requestDocumentTopicSearchOpen } from '../components/documentTopicSearchEvents';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { createPaletteReviewActions } from './appControllerPaletteReviewActions';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteHistoryActions } from './appPaletteHistoryActions';
import { createSelectionAnnotationPaletteActions } from './appPaletteSelectionActions';
import { restartAppWithReadingProgress } from './appRestartPersistence';
import { repairEditorTable } from './editorRepairTableCommand';
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
      showAppRuntimeNotice('Merge failed.');
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
    const result = await devReimportSelectedTopic({ nodeId });
    if (result.status !== 'reimported') {
      showAppRuntimeNotice(result.detail);
      return false;
    }
    await useWorkspaceStore.persist.rehydrate();
    await openWorkspaceNodeWithPreparedDocument(result.nodeId ?? nodeId, { forceLoad: true });
    return true;
  };
}

function createRestartAppCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
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

function createPaletteViewActions() {
  return {
    onToggleDismissedTopicsVisibility: requestToggleDismissedTopicVisibility
  };
}

function createPaletteStudyActions(args: {
  isStudyMode: boolean;
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
}) {
  return {
    exitStudyMode: args.study.exitStudyMode,
    isReviewMode: args.isStudyMode,
    startStudyMode: args.study.startStudyMode,
    toggleDevReviewStatusBarPersistence: args.study.toggleDevReviewStatusBarPersistence
  };
}

function createPaletteAppearanceActions(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
}) {
  return {
    onSetPdfReadingMode: args.appearance.setPdfReadingMode,
    onToggleBaseColorMode: args.appearance.toggleBaseColorMode,
    onToggleEditorDisplayMode: args.appearance.toggleEditorDisplayMode
  };
}

function createPaletteRuntimeActions(args: {
  layoutProps: WorkspaceLayoutProps;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
}) {
  return {
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    openNotesView: args.layoutProps.nodeList.onOpenNotesView,
    openPostponeTopicPanel: () => args.layoutProps.review.onOpenPostponeTopicPanel(),
    openReadwiseReaderSettings: () => openReadwiseReaderSettings(args.runtime),
    openTrashView: args.trash.openTrashView,
    recordRecentCommand: args.runtime.recordRecentCommand,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen: args.runtime.setIsMoveToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startClipboardImport: args.layoutProps.imports.onStartClipboardImport,
    trashViewOpen: args.trash.isTrashViewOpen
  };
}

export function createPaletteRunnerArgs(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  onOpenHelpSearch: () => void;
  paletteItems: CommandPaletteItem[];
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    clearSettingsRequest: () => clearSettingsRequest(args.runtime),
    closeTrashView: args.trash.closeTrashView,
    createFolder: createDirectNodeCommand('folder', args),
    createItem: createDirectNodeCommand('item', args),
    createTopic: createDirectNodeCommand('topic', args),
    createVirtualNode: createVirtualNodeCommand(args),
    ...createSelectionAnnotationPaletteActions(args),
    ...createPaletteReviewActions(args),
    ...createPaletteHistoryActions(args),
    ...createPaletteStudyActions(args),
    enterPriorityMode: args.layoutProps.document.onEnterPriorityQuickSet,
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    findInTopic: requestDocumentTopicSearchOpen,
    mergeHighlightsIntoTopic: createMergeHighlightsIntoTopicCommand({ ws: args.ws }),
    ...createPaletteNavigationActions(args),
    importDirectory: args.formalImport.startImportDirectory,
    importSingleFile: args.formalImport.startImportFile,
    onRestartApp: createRestartAppCommand(args),
    onOpenHelpSearch: args.onOpenHelpSearch,
    ...createPaletteAppearanceActions(args),
    ...createPaletteViewActions(),
    ...createPaletteRuntimeActions(args),
    onToggleDevTools: toggleMainWindowDevTools,
    onToggleImmersiveMode: args.layoutProps.layoutChrome.onToggleImmersiveMode,
    onToggleBothSidebarVisibility: args.layoutProps.layoutChrome.onToggleBothSidebarVisibility,
    onToggleListVisibility: args.layoutProps.layoutChrome.onToggleListVisibility,
    onToggleRightSidebarVisibility: args.layoutProps.layoutChrome.onToggleRightSidebarVisibility,
    paletteItems: args.paletteItems,
    repairTable: () => repairEditorTable({
      activeNodeId: args.ws.activeNodeId,
      editorRef: args.runtime.editorRef,
      updateNodeContent: args.ws.updateNodeContent
    }),
    reimportSelectedTopic: createReimportSelectedTopicCommand(args),
    resetImportData: args.formalImport.resetImportData
  };
}
