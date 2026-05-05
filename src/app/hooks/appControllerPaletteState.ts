import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { mergeRuntimeReadwiseTopicHighlights } from '../../shared/platform/readwiseTopicMerge';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
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
    args.ws.createChildNode(INBOX_NODE_ID, '', kind);
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

function createRestartAppCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return () =>
    restartAppWithReadingProgress({
      activeNodeId: args.ws.activeNodeId,
      editorRef: args.runtime.editorRef,
      getReadingPositionSelection: () =>
        args.runtime.readingPositionRef.current.nodeId === args.ws.activeNodeId
          ? args.runtime.readingPositionRef.current.selection
          : null,
      isViewingTrashNode: args.runtime.isViewingTrashNode,
      nodeViewById: args.ws.nodeViewById,
      setNodeViewState: args.ws.setNodeViewState
    });
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
    enterPriorityMode: args.layoutProps.onEnterPriorityQuickSet,
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.study.exitStudyMode,
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    findInTopic: requestDocumentTopicSearchOpen,
    mergeHighlightsIntoTopic: createMergeHighlightsIntoTopicCommand({ ws: args.ws }),
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goParent: args.nav.handleGoParent,
    goToNode: () => undefined,
    gradeReviewCard: args.ws.gradeReviewCard,
    importDirectory: args.formalImport.startImportDirectory,
    importSingleFile: args.formalImport.startImportFile,
    isReviewMode: args.isStudyMode,
    moveToNode: () => undefined,
    onRestartApp: createRestartAppCommand(args),
    onToggleDevTools: toggleMainWindowDevTools,
    onToggleEditorDisplayMode: args.appearance.toggleEditorDisplayMode,
    onToggleImmersiveMode: args.layoutProps.onToggleImmersiveMode,
    onToggleListVisibility: args.layoutProps.onToggleListVisibility,
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    openReadwiseReaderSettings: () => openReadwiseReaderSettings(args.runtime),
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    resetImportData: args.formalImport.resetImportData,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen: args.runtime.setIsMoveToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startClipboardImport: args.layoutProps.onStartClipboardImport,
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
