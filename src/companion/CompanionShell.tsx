import { useCallback, useEffect, useMemo, useState, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { CompanionShellView } from './CompanionShellView';
import type { CompanionSecondaryDestinationId } from './CompanionTabsConfig';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionDirectorySelectionState } from './useCompanionDirectorySelectionState';
import { useCompanionExternalDirectory } from './useCompanionExternalDirectory';
import { useCompanionSyncSettingsPage, type CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTabsConfig } from './useCompanionTabsConfig';
import { useCompanionTopBarProps } from './useCompanionTopBarProps';
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

function resolveActiveSecondaryDestination(args: {
  activeAction: CompanionTabAction;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  settingsPage: CompanionSettingsPage;
}): CompanionSecondaryDestinationId | null {
  if (args.activeAction === 'recent' && args.isBrowseDirectoryOpen) return 'directory';
  if (args.activeAction === 'review' && args.isOnlyReviewOpen) return 'onlyReview';
  if (args.activeAction === 'more' && args.settingsPage !== 'list') return args.settingsPage as CompanionSecondaryDestinationId;
  return null;
}

function useCompanionSecondaryDestinations(args: {
  activeAction: CompanionTabAction;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  settingsPage: CompanionSettingsPage;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  const handleSecondaryDestination = (destinationId: CompanionSecondaryDestinationId) => {
    if (destinationId === 'directory') {
      args.surface.handleTabAction('recent');
      args.setIsBrowseDirectoryOpen(true);
      return;
    }
    if (destinationId === 'onlyReview') {
      args.surface.handleTabAction('review');
      args.setIsOnlyReviewOpen(true);
      return;
    }
    args.surface.handleTabAction('more');
    args.setSettingsPage(destinationId);
  };
  const activeSecondaryDestinationId = resolveActiveSecondaryDestination(args);
  return { activeSecondaryDestinationId, handleSecondaryDestination };
}

function useCompanionReviewChrome(args: {
  floatingBar: ReturnType<typeof useFloatingBarVisibility>;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const isBottomBarDisabled = args.surface.isSubmittingGrade || args.surface.isSubmittingReadingAction;
  const isReviewTaskActive = args.surface.activeAction === 'review' && Boolean(args.surface.reviewSession.currentCard);
  const reviewBreadcrumbItems = useReviewBreadcrumbItems(
    args.workspaceSync.state.workspace_snapshot,
    args.surface.reviewSession.currentCard?.nodeId ?? null
  );
  const navigation = useCompanionNavigationVisibility(args.floatingBar, isReviewTaskActive);
  return { isBottomBarDisabled, isReviewTaskActive, reviewBreadcrumbItems, ...navigation };
}

function useCompanionShellActions(args: {
  directoryState: ReturnType<typeof useCompanionDirectorySelectionState>;
  externalDirectory: CompanionExternalDirectory;
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
  workspaceSync: ReturnType<typeof useCompanionWorkspaceSync>;
}) {
  const topBarProps = useCompanionTopBarProps({
    resetDirectorySelection: args.directoryState.resetDirectorySelection,
    directorySelection: args.directoryState.directorySelection,
    externalDirectory: args.externalDirectory,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen: args.setIsCaptureSheetOpen,
    setIsOnlyReviewOpen: args.setIsOnlyReviewOpen,
    setSettingsPage: args.setSettingsPage,
    settingsPage: args.settingsPage,
    surface: args.surface,
    workspaceSync: args.workspaceSync
  });
  const handleNavigationAction = (action: CompanionTabAction) => args.surface.handleTabAction(action);
  const secondaryDestinations = useCompanionSecondaryDestinations({
    activeAction: args.surface.activeAction,
    isBrowseDirectoryOpen: args.isBrowseDirectoryOpen,
    isOnlyReviewOpen: args.isOnlyReviewOpen,
    settingsPage: args.settingsPage,
    setIsBrowseDirectoryOpen: args.setIsBrowseDirectoryOpen,
    setIsOnlyReviewOpen: args.setIsOnlyReviewOpen,
    setSettingsPage: args.setSettingsPage,
    surface: args.surface
  });
  return { handleNavigationAction, secondaryDestinations, topBarProps };
}

function useCompanionShellModel(bootstrapState: NativeCompanionBootstrapState) {
  const floatingBar = useFloatingBarVisibility('companion-bottom-tabs');
  const [isBrowseDirectoryOpen, setIsBrowseDirectoryOpen] = useState(false);
  const [isCaptureSheetOpen, setIsCaptureSheetOpen] = useState(false);
  const [isOnlyReviewOpen, setIsOnlyReviewOpen] = useState(false);
  const workspaceSync = useCompanionWorkspaceSync(bootstrapState);
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar);
  const companionTabs = useCompanionTabsConfig();
  const { setSettingsPage, settingsPage } = useCompanionSyncSettingsPage({
    activeAction: surface.activeAction,
    syncOnboardingStatus: workspaceSync.state.sync_onboarding_status
  });
  const reviewChrome = useCompanionReviewChrome({ floatingBar, surface, workspaceSync });
  const directoryState = useCompanionDirectorySelectionState(isBrowseDirectoryOpen);
  const externalDirectory = useCompanionExternalDirectory();
  const handleContainerScroll = useCompanionShellScrollHandler(floatingBar, surface);
  const actions = useCompanionShellActions({
    directoryState,
    externalDirectory,
    isBrowseDirectoryOpen,
    isOnlyReviewOpen,
    setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen,
    setIsOnlyReviewOpen,
    setSettingsPage,
    settingsPage,
    surface,
    workspaceSync
  });
  useResetCompanionSubsurfaces({ activeAction: surface.activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen });

  return {
    activeSecondaryDestinationId: actions.secondaryDestinations.activeSecondaryDestinationId,
    companionTabs,
    directorySelection: directoryState.directorySelection,
    floatingBar,
    handleContainerScroll,
    handleContentTap: reviewChrome.handleContentTap,
    handleNavigationAction: actions.handleNavigationAction,
    handleSecondaryDestination: actions.secondaryDestinations.handleSecondaryDestination,
    isBottomBarDisabled: reviewChrome.isBottomBarDisabled,
    isBrowseDirectoryOpen,
    isCaptureSheetOpen,
    isOnlyReviewOpen,
    isNavigationVisible: reviewChrome.isNavigationVisible,
    isReviewTaskActive: reviewChrome.isReviewTaskActive,
    reviewBreadcrumbItems: reviewChrome.reviewBreadcrumbItems,
    setIsCaptureSheetOpen,
    setDirectorySelection: directoryState.setDirectorySelection,
    setSettingsPage,
    settingsPage,
    surface,
    topBarProps: actions.topBarProps,
    workspaceSync
  };
}

export type CompanionShellModel = ReturnType<typeof useCompanionShellModel>;

export function CompanionShell(props: { bootstrapState: NativeCompanionBootstrapState }) {
  const model = useCompanionShellModel(props.bootstrapState);

  return <CompanionShellView model={model} />;
}
