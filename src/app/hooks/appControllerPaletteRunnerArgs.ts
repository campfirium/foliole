import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import type { CommandPaletteItem } from '../../shared/commands/types';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { exportCurrentArticleMirror } from '../../shared/platform/articleMirrorExport';
import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';
import { selectLocalFileToOpen } from '../../shared/platform/localFileRuntimeRepository';
import { mergeRuntimeReadwiseTopicHighlights } from '../../shared/platform/readwiseTopicMerge';
import { openFolioleReleaseLink } from '../../shared/platform/releaseLinks';
import {
  checkForFolioleUpdates,
  openFolioleLatestRelease
} from '../../shared/platform/updateCheck';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { createEditorOperationApplyContext } from './appControllerEditorHandlers';
import { createPaletteReviewActions } from './appControllerPaletteReviewActions';
import { createPaletteRuntimeActions } from './appControllerPaletteRuntimeActions';
import { createPublishingPaletteActions } from './appControllerPublishingActions';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { createPaletteCreationActions } from './appPaletteCreationActions';
import { createPaletteDocumentActions } from './appPaletteDocumentActions';
import { createPaletteDocumentScrollActions } from './appPaletteDocumentScrollActions';
import { createPaletteHistoryActions } from './appPaletteHistoryActions';
import { createPaletteImportActions } from './appPaletteImportActions';
import { createSelectionAnnotationPaletteActions } from './appPaletteSelectionActions';
import { createSplitTopicCommand } from './appPaletteSplitTopicCommand';
import { createPaletteSurfaceActions } from './appPaletteSurfaceActions';
import { restartAppWithReadingProgress } from './appRestartPersistence';
import { repairEditorTable } from './editorRepairTableCommand';
import { clearSettingsRequest } from './settingsOverlayRequest';
import type { useFormalImport } from './useFormalImport';

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
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return {
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goToLastChild: args.nav.handleGoToLastChild,
    goParent: args.nav.handleGoParent,
    goToNode: () => undefined,
    moveToNode: () => undefined,
    renameNode: () =>
      requestNodeRename(args.ws.activeNodeId, () => args.runtime.editorRef.current?.focus())
  };
}

function createPaletteReleaseActions() {
  return {
    checkForUpdates: () =>
      checkForFolioleUpdates({ force: true, notify: true }).then(() => undefined),
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

async function openLocalFile() {
  const result = await selectLocalFileToOpen();
  if (result.status === 'error') showAppRuntimeNotice(result.message);
}

type PaletteRunnerArgs = {
  appearance: ReturnType<typeof useAppearanceSettings>;
  demoOperationTranslate: Translate;
  externalView: ReturnType<typeof useWorkspaceControllerState>['externalView'];
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
  virtualView: ReturnType<typeof useWorkspaceControllerState>['virtualView'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
};

export function createPaletteRunnerArgs(args: PaletteRunnerArgs) {
  return {
    clearSettingsRequest: () => clearSettingsRequest(args.runtime),
    closeTrashView: args.trash.closeTrashView,
    demoOperationTranslate: args.demoOperationTranslate,
    ...createPaletteCreationActions(args),
    ...createSelectionAnnotationPaletteActions(args),
    ...createPaletteReviewActions(args),
    ...createPaletteHistoryActions({
      flushPendingEditorDraft: args.runtime.flushPendingEditorDraft,
      getEditorOperationContext: () => createEditorOperationApplyContext(args),
      ws: args.ws
    }),
    ...createPaletteStudyActions(args),
    enterPriorityMode: args.layoutProps.document.onEnterPriorityQuickSet,
    exportCurrentArticle: createExportCurrentArticleCommand(args),
    ...createPublishingPaletteActions(args),
    ...createPaletteDocumentActions(),
    ...createPaletteDocumentScrollActions(args.runtime.editorRef),
    mergeHighlightsIntoTopic: createMergeHighlightsIntoTopicCommand({ ws: args.ws }),
    openSplitTopicDialog: createSplitTopicCommand(args),
    ...createPaletteNavigationActions(args),
    ...createPaletteImportActions(args.formalImport),
    openLocalFile,
    onRestartApp: createRestartAppCommand(args),
    onOpenHelpSearch: args.onOpenHelpSearch,
    onSendFeedback: args.onSendFeedback,
    ...createPaletteSurfaceActions(args),
    ...createPaletteAppearanceActions(args),
    ...createPaletteReleaseActions(),
    ...createPaletteRuntimeActions(args),
    onToggleDevTools: toggleMainWindowDevTools,
    onToggleImmersiveMode: args.layoutProps.layoutChrome.onToggleImmersiveMode,
    onToggleBothSidebarVisibility: args.layoutProps.layoutChrome.onToggleBothSidebarVisibility,
    onToggleListVisibility: args.layoutProps.layoutChrome.onToggleListVisibility,
    onToggleRightSidebarVisibility: args.layoutProps.layoutChrome.onToggleRightSidebarVisibility,
    paletteItems: args.paletteItems,
    repairTable: () =>
      repairEditorTable({
        activeNodeId: args.ws.activeNodeId,
        editorRef: args.runtime.editorRef,
        updateNodeContent: args.ws.updateNodeContent
      }),
    reimportSelectedTopic: createReimportSelectedTopicCommand(args)
  };
}
