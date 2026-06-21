import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';
import { mergeRuntimeReadwiseTopicHighlights } from '../../shared/platform/readwiseTopicMerge';
import { openFolioleReleaseLink } from '../../shared/platform/releaseLinks';
import { checkForFolioleUpdates, openFolioleLatestRelease } from '../../shared/platform/updateCheck';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { requestToggleDismissedTopicVisibility } from '../components/dismissedTopicVisibilitySetting';
import { requestDocumentTopicSearchOpen } from '../components/documentTopicSearchEvents';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { createPaletteReviewActions } from './appControllerPaletteReviewActions';
import { createPaletteRuntimeActions } from './appControllerPaletteRuntimeActions';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteHistoryActions } from './appPaletteHistoryActions';
import { createPaletteImportActions } from './appPaletteImportActions';
import { createSelectionAnnotationPaletteActions } from './appPaletteSelectionActions';
import { createPaletteSurfaceActions } from './appPaletteSurfaceActions';
import { restartAppWithReadingProgress } from './appRestartPersistence';
import { repairEditorTable } from './editorRepairTableCommand';
import { clearSettingsRequest } from './settingsOverlayRequest';
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
      await refreshWorkspaceState('merge-highlights');
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
    await refreshWorkspaceState('reimport-selected-topic');
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

function createPaletteReleaseActions() {
  return {
    checkForUpdates: () => checkForFolioleUpdates({ force: true, notify: true }).then(() => undefined),
    openGitHubDiscussions: () => openFolioleReleaseLink('discussions'),
    openGitHubIssues: () => openFolioleReleaseLink('issues'),
    openGitHubRepository: () => openFolioleReleaseLink('repository'),
    openSupportEmail: () => openFolioleReleaseLink('contactEmail'),
    openLatestRelease: openFolioleLatestRelease,
    openYouTubePlaylist: () => openFolioleReleaseLink('youtubePlaylist')
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

export function createPaletteRunnerArgs(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  onOpenHelpSearch: () => void;
  onSendFeedback: () => void;
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
    ...createSelectionAnnotationPaletteActions(args),
    ...createPaletteReviewActions(args),
    ...createPaletteHistoryActions(args),
    ...createPaletteStudyActions(args),
    enterPriorityMode: args.layoutProps.document.onEnterPriorityQuickSet,
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    findInTopic: requestDocumentTopicSearchOpen,
    mergeHighlightsIntoTopic: createMergeHighlightsIntoTopicCommand({ ws: args.ws }),
    ...createPaletteNavigationActions(args),
    ...createPaletteImportActions(args.formalImport),
    onRestartApp: createRestartAppCommand(args),
    onOpenHelpSearch: args.onOpenHelpSearch,
    onSendFeedback: args.onSendFeedback,
    ...createPaletteSurfaceActions(args),
    ...createPaletteAppearanceActions(args),
    ...createPaletteViewActions(),
    ...createPaletteReleaseActions(),
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
    reimportSelectedTopic: createReimportSelectedTopicCommand(args)
  };
}
