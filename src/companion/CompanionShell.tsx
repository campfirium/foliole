import { useCallback, useEffect, useMemo, useState, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { CompanionShellView } from './CompanionShellView';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionBrowseSortState } from './useCompanionBrowseSortState';
import { useCompanionDirectorySelectionState } from './useCompanionDirectorySelectionState';
import { useCompanionExternalDirectory } from './useCompanionExternalDirectory';
import { useCompanionShellActions } from './useCompanionShellActions';
import { useCompanionSyncSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTabsConfig } from './useCompanionTabsConfig';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

function useCompanionNavigationVisibility(floatingBar: ReturnType<typeof useFloatingBarVisibility>, isReviewTaskActive: boolean) {
  const isNavigationVisible = useMemo(
    () => !isReviewTaskActive,
    [isReviewTaskActive]
  );

  const handleContentTap = () => {
    if (isReviewTaskActive || floatingBar.isVisible) {
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
  const navigation = useCompanionNavigationVisibility(args.floatingBar, isReviewTaskActive);
  return { isBottomBarDisabled, isReviewTaskActive, reviewBreadcrumbItems, ...navigation };
}

function useCompanionSearchArticleReturn(surface: ReturnType<typeof useCompanionArticleSurface>) {
  const [searchArticleNodeId, setSearchArticleNodeId] = useState<string | null>(null);
  const handleOpenSearchTopic = useCallback((nodeId: string) => {
    setSearchArticleNodeId(nodeId);
    surface.handleSelectBrowseNode(nodeId);
  }, [surface]);
  const handleExitSearchArticle = useCallback(() => {
    setSearchArticleNodeId(null);
    surface.handleExitSearchArticle();
  }, [surface]);
  const isSearchArticleOpen = Boolean(
    searchArticleNodeId &&
    surface.selectedBrowseNodeId === searchArticleNodeId &&
    surface.readableArticle?.nodeId === searchArticleNodeId
  );
  return { handleExitSearchArticle, handleOpenSearchTopic, isSearchArticleOpen };
}

function buildCompanionShellModel(args: {
  actions: ReturnType<typeof useCompanionShellActions>;
  browseSort: ReturnType<typeof useCompanionBrowseSortState>;
  companionTabs: ReturnType<typeof useCompanionTabsConfig>;
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>;
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  handleContainerScroll: ReturnType<typeof useCompanionShellScrollHandler>;
  isBrowseDirectoryOpen: boolean;
  isCaptureSheetOpen: boolean;
  isOnlyReviewOpen: boolean;
  reviewChrome: ReturnType<typeof useCompanionReviewChrome>;
  searchArticle: ReturnType<typeof useCompanionSearchArticleReturn>;
  setIsCaptureSheetOpen(open: boolean): void;
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
    handleExitSearchArticle: args.searchArticle.handleExitSearchArticle,
    handleNavigationAction: args.actions.handleNavigationAction,
    handleOpenSearchTopic: args.searchArticle.handleOpenSearchTopic,
    handleSecondaryDestination: args.actions.secondaryDestinations.handleSecondaryDestination,
    isBottomBarDisabled: args.reviewChrome.isBottomBarDisabled,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isCaptureSheetOpen: args.isCaptureSheetOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    isSearchArticleOpen: args.searchArticle.isSearchArticleOpen,
    isNavigationVisible: args.workspaceSync.isWorkspaceSyncStateReady && args.reviewChrome.isNavigationVisible,
    isReviewTaskActive: args.reviewChrome.isReviewTaskActive,
    reviewBreadcrumbItems: args.reviewChrome.reviewBreadcrumbItems,
    setIsCaptureSheetOpen: args.setIsCaptureSheetOpen,
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

function useCompanionShellModel(bootstrapState: NativeCompanionBootstrapState) {
  const floatingBar = useFloatingBarVisibility('companion-bottom-tabs');
  const browseSort = useCompanionBrowseSortState();
  const [isBrowseDirectoryOpen, setIsBrowseDirectoryOpen] = useState(false);
  const [isCaptureSheetOpen, setIsCaptureSheetOpen] = useState(false);
  const [isOnlyReviewOpen, setIsOnlyReviewOpen] = useState(false);
  const workspaceSync = useCompanionWorkspaceSync(bootstrapState);
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar, {
    sortDirection: browseSort.browseSortDirection,
    sortKey: browseSort.browseSortKey
  }, {
    isOnlyReviewOpen
  });
  const companionTabs = useCompanionTabsConfig();
  const { setSettingsPage, settingsPage } = useCompanionSyncSettingsPage({
    activeAction: surface.activeAction,
    syncOnboardingStatus: workspaceSync.state.sync_onboarding_status
  });
  const reviewChrome = useCompanionReviewChrome({ floatingBar, surface, workspaceSync });
  const searchArticle = useCompanionSearchArticleReturn(surface);
  const directoryState = useCompanionDirectorySelectionState(isBrowseDirectoryOpen);
  const externalDirectory = useCompanionExternalDirectory();
  const handleContainerScroll = useCompanionShellScrollHandler(floatingBar, surface);
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
    setIsCaptureSheetOpen,
    setIsOnlyReviewOpen,
    setSettingsPage,
    settingsPage,
    surface,
    workspaceSync
  });
  useResetCompanionSubsurfaces({ activeAction: surface.activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen });

  return buildCompanionShellModel({
    actions,
    browseSort,
    companionTabs,
    directoryState,
    floatingBar,
    handleContainerScroll,
    isBrowseDirectoryOpen,
    isCaptureSheetOpen,
    isOnlyReviewOpen,
    reviewChrome,
    searchArticle,
    setIsCaptureSheetOpen,
    setSettingsPage,
    settingsPage,
    surface,
    workspaceSync
  });
}

export type CompanionShellModel = ReturnType<typeof useCompanionShellModel>;

export function CompanionShell(props: { bootstrapState: NativeCompanionBootstrapState }) {
  const model = useCompanionShellModel(props.bootstrapState);

  return <CompanionShellView model={model} />;
}
