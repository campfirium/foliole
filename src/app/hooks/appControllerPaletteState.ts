import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { restartMainWindowApp, toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildPaletteState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
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
  const runPaletteCommand = createPaletteCommandRunner({
    closeTrashView: args.trash.closeTrashView,
    completeReviewItem: args.ws.completeReviewItem,
    createFolder: createDirectNodeCommand('folder', args),
    createItem: createDirectNodeCommand('item', args),
    createTopic: createDirectNodeCommand('topic', args),
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.study.exitStudyMode,
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goToNode: () => undefined,
    moveToNode: () => undefined,
    goParent: args.nav.handleGoParent,
    gradeReviewCard: args.ws.gradeReviewCard,
    importDirectory: args.formalImport.startImportDirectory,
    importSingleFile: args.formalImport.startImportFile,
    resetImportData: args.formalImport.resetImportData,
    isReviewMode: args.isStudyMode,
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    onToggleEditorDisplayMode: args.appearance.toggleEditorDisplayMode,
    onToggleListVisibility: args.layoutProps.onToggleListVisibility,
    onRestartApp: restartMainWindowApp,
    onToggleDevTools: toggleMainWindowDevTools,
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setIsMoveToNodePaletteOpen: args.runtime.setIsMoveToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startClipboardImport: args.layoutProps.onStartClipboardImport,
    startReviewSession: args.ws.startReviewSession,
    startStudyMode: args.study.startStudyMode,
    trashViewOpen: args.trash.isTrashViewOpen
  });

  return buildPaletteState(
    args.runtime.isCommandPaletteOpen,
    args.paletteItems,
    args.runtime.recentCommandIds,
    () => args.runtime.setIsCommandPaletteOpen(false),
    runPaletteCommand
  );
}
