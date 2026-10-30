import { useCallback, useEffect, useMemo, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

import { CompanionCustomCssProvider } from './CompanionCustomCssProvider';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import type { CompanionTabAction } from './CompanionFloatingBars';
import { useCompanionNavigationField } from './CompanionNavigationProvider';
import { CompanionNodeLinkRuntime } from './CompanionNodeLinkRuntime';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { CompanionShareInboxNotice } from './CompanionShareInboxNotice';
import { CompanionShellView } from './CompanionShellView';
import { CompanionSyncGroupRuntime } from './CompanionSyncGroupRuntime';
import { CompanionSyncProtocolNotice } from './CompanionSyncProtocolNotice';
import { useCompanionAndroidBack } from './useCompanionAndroidBack';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionBrowseSortState } from './useCompanionBrowseSortState';
import { useCompanionCaptureController } from './useCompanionCaptureController';
import { useCompanionDirectorySelectionState } from './useCompanionDirectorySelectionState';
import { useCompanionExternalDirectory } from './useCompanionExternalDirectory';
import { useCompanionReviewTraining } from './useCompanionReviewTraining';
import { useCompanionSearchNavigation } from './useCompanionSearchNavigation';
import { useCompanionShellActions } from './useCompanionShellActions';
import { useSortedArticleSurface } from './useCompanionShellReading';
import { useCompanionSyncSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTabsConfig } from './useCompanionTabsConfig';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

function useCompanionNavigationVisibility(floatingBar: ReturnType<typeof useFloatingBarVisibility>, isFlowActive: boolean) {
  const isNavigationVisible = useMemo(
    () => !isFlowActive,
    [isFlowActive]
  );

  const handleContentTap = () => {
    if (isFlowActive || floatingBar.isVisible) {
      return;
    }
    floatingBar.revealBar();
  };

  return { handleContentTap, isNavigationVisible };
}

function useCompanionShellScrollHandler(
  floatingBar: ReturnType<typeof useFloatingBarVisibility>,
  surface: ReturnType<typeof useCompanionArticleSurface>
) {
  return useCallback((event: ReactUIEvent<HTMLElement>) => {
    floatingBar.handleContainerScroll(event);
    surface.handleViewScroll(event.currentTarget.scrollTop);
  }, [floatingBar, surface]);
}

function useResetCompanionSubsurfaces(args: {
  activeAction: CompanionTabAction;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
}) {
  const { activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen } = args;
  useEffect(() => {
    if (activeAction !== 'recent') setIsBrowseDirectoryOpen(false);
    if (activeAction !== 'review') setIsOnlyReviewOpen(false);
  }, [activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen]);
}

function useCompanionReviewChrome(args: {
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const isBottomBarDisabled = args.surface.isSubmittingGrade || args.surface.isSubmittingReadingAction;
  const isReviewTaskActive = args.surface.activeAction === 'review' && Boolean(args.surface.effectiveReviewSession.currentCard);
  const reviewBreadcrumbItems = useReviewBreadcrumbItems(
    args.workspaceSync.state.workspace_snapshot,
    args.surface.effectiveReviewSession.currentCard?.nodeId ?? null
  );
  const navigation = useCompanionNavigationVisibility(args.floatingBar, args.surface.activeAction === 'review');
  return { isBottomBarDisabled, isReviewTaskActive, reviewBreadcrumbItems, ...navigation };
}

function buildCompanionShellModel(args: {
  actions: ReturnType<typeof useCompanionShellActions>;
  browseSort: ReturnType<typeof useCompanionBrowseSortState>;
  companionTabs: ReturnType<typeof useCompanionTabsConfig>;
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>;
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  handleContainerScroll: ReturnType<typeof useCompanionShellScrollHandler>;
  capture: ReturnType<typeof useCompanionCaptureController>;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  reviewChrome: ReturnType<typeof useCompanionReviewChrome>;
  searchArticle: ReturnType<typeof useCompanionSearchNavigation>;
  setSettingsPage: ReturnType<typeof useCompanionSyncSettingsPage>['setSettingsPage'];
  settingsPage: ReturnType<typeof useCompanionSyncSettingsPage>['settingsPage'];
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  return {
    activeSecondaryDestinationId: args.actions.secondaryDestinations.activeSecondaryDestinationId,
    browseSortDirection: args.browseSort.browseSortDirection,
    browseSortKey: args.browseSort.browseSortKey,
    companionTabs: args.companionTabs,
    directorySelection: args.directoryState.directorySelection,
    floatingBar: args.floatingBar,
    handleContainerScroll: args.handleContainerScroll,
    handleContentTap: args.reviewChrome.handleContentTap,
    handleExitSearchArticle: args.searchArticle.exitTopic,
    handleExitSearchExternalDocument: args.searchArticle.exitExternalDocument,
    handleExitSearchPdf: args.searchArticle.exitPdf,
    handleNavigationAction: args.actions.handleNavigationAction,
    handleOpenSearchExternalDocument: args.searchArticle.openExternalDocument,
    handleOpenSearchPdf: args.searchArticle.openPdf,
    handleOpenSearchTopic: args.searchArticle.openTopic,
    ...args.capture,
    handleSecondaryDestination: args.actions.secondaryDestinations.handleSecondaryDestination,
    isBottomBarDisabled: args.reviewChrome.isBottomBarDisabled,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    isSearchArticleOpen: args.searchArticle.isTopicOpen,
    isNavigationVisible: args.workspaceSync.isWorkspaceSyncStateReady && args.reviewChrome.isNavigationVisible,
    isReviewTaskActive: args.reviewChrome.isReviewTaskActive,
    reviewBreadcrumbItems: args.reviewChrome.reviewBreadcrumbItems,
    searchExternalDocument: args.searchArticle.externalDocument,
    searchPdfResult: args.searchArticle.pdfResult,
    searchMatch: args.searchArticle.searchMatch,
    setBrowseSortDirection: args.browseSort.setBrowseSortDirection,
    setBrowseSortKey: args.browseSort.setBrowseSortKey,
    setDirectorySelection: args.directoryState.setDirectorySelection,
    setSettingsPage: args.setSettingsPage,
    settingsPage: args.settingsPage,
    surface: args.surface,
    topBarProps: args.actions.topBarProps,
    workspaceSync: args.workspaceSync
  };
}

function useCompanionShellModel(workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>) {
  const floatingBar = useFloatingBarVisibility('companion-bottom-tabs');
  const browseSort = useCompanionBrowseSortState();
  const [isBrowseDirectoryOpen, setIsBrowseDirectoryOpen] = useCompanionNavigationField('isBrowseDirectoryOpen', false);
  const [isOnlyReviewOpen, setIsOnlyReviewOpen] = useCompanionNavigationField('isOnlyReviewOpen', false);
  const surface = useSortedArticleSurface(workspaceSync, floatingBar, browseSort, isOnlyReviewOpen);
  const companionTabs = useCompanionTabsConfig();
  const { setSettingsPage, settingsPage } = useCompanionSyncSettingsPage({
    activeAction: surface.activeAction,
    syncOnboardingStatus: workspaceSync.state.sync_onboarding_status
  });
  const reviewChrome = useCompanionReviewChrome({ floatingBar, surface, workspaceSync });
  const searchArticle = useCompanionSearchNavigation(surface);
  const directoryState = useCompanionDirectorySelectionState(isBrowseDirectoryOpen);
  const externalDirectory = useCompanionExternalDirectory();
  const handleContainerScroll = useCompanionShellScrollHandler(floatingBar, surface);
  const capture = useCompanionCaptureController({
    directorySelection: directoryState.directorySelection, isBrowseDirectoryOpen, setIsBrowseDirectoryOpen, surface, workspaceSync
  });
  const actions = useCompanionShellActions({
    browseSortDirection: browseSort.browseSortDirection,
    browseSortKey: browseSort.browseSortKey,
    directoryState,
    externalDirectory,
    isBrowseDirectoryOpen,
    isOnlyReviewOpen,
    setBrowseSortDirection: browseSort.setBrowseSortDirection,
    setBrowseSortKey: browseSort.setBrowseSortKey,
    setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen: capture.setIsCaptureSheetOpen,
    setIsOnlyReviewOpen,
    setSettingsPage,
    settingsPage,
    surface,
    workspaceSync
  });
  useResetCompanionSubsurfaces({ activeAction: surface.activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen });

  const model = buildCompanionShellModel({
    actions,
    browseSort,
    companionTabs,
    directoryState,
    floatingBar,
    handleContainerScroll,
    capture,
    isBrowseDirectoryOpen,
    isOnlyReviewOpen,
    reviewChrome,
    searchArticle,
    setSettingsPage,
    settingsPage,
    surface,
    workspaceSync
  });
  return model;
}

export type CompanionShellModel = ReturnType<typeof useCompanionShellModel>;

export function CompanionRestoredShell(props: {
  bootstrapState: NativeCompanionBootstrapState; workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const model = useCompanionShellModel(props.workspaceSync);
  useCompanionAndroidBack(model);
  useCompanionReviewTraining(props.bootstrapState.database_ready && model.workspaceSync.isWorkspaceSyncStateReady,
    model.surface.activeAction === 'review' && !model.surface.isFlowBrowsing, model.workspaceSync.state.workspace_snapshot);

  return (
    <CompanionCustomCssProvider
      refreshKey={model.workspaceSync.state.last_synced_at}
      runtimeKind={props.bootstrapState.runtime_kind}
    >
      <CompanionSyncGroupRuntime bootstrapState={props.bootstrapState} workspaceSync={model.workspaceSync}>
        <CompanionNodeLinkRuntime model={model}>
          <CompanionSyncProtocolNotice error={model.workspaceSync.error}>
            <CompanionShareInboxNotice workspaceSync={model.workspaceSync}>
              <CompanionDraftProvider key={model.workspaceSync.state.workspace_snapshot?.libraryScope ?? props.bootstrapState.database_path}>
                <CompanionShellView model={model} />
              </CompanionDraftProvider>
            </CompanionShareInboxNotice>
          </CompanionSyncProtocolNotice>
        </CompanionNodeLinkRuntime>
      </CompanionSyncGroupRuntime>
    </CompanionCustomCssProvider>
  );
}
