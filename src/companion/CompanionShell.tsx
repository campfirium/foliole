import { useCallback, useEffect, useMemo, useState, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { CompanionExternalDirectory } from '../shared/platform/companionExternalDocuments';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { renderCompanionShellContent } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionSyncInlineStatus } from './CompanionSyncInlineStatus';
import type { CompanionSecondaryDestinationId } from './CompanionTabsConfig';
import { CompanionTopBar } from './CompanionTopBar';
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
    () => !isReviewTaskActive && floatingBar.isVisible,
    [floatingBar.isVisible, isReviewTaskActive]
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
  if (args.activeAction === 'more' && args.settingsPage !== 'list') {
    return args.settingsPage as CompanionSecondaryDestinationId;
  }
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

export function CompanionShell(props: { bootstrapState: NativeCompanionBootstrapState }) {
  const model = useCompanionShellModel(props.bootstrapState);

  return (
    <>
      <main className="h-dvh bg-companion-base text-foreground">
        <div
          className="h-dvh overflow-y-auto"
          data-testid="companion-scroll-container"
          onClick={model.handleContentTap}
          onScroll={model.handleContainerScroll}
          onTouchEnd={model.floatingBar.handleTouchEnd}
          onTouchMove={model.floatingBar.handleTouchMove}
          onTouchStart={model.floatingBar.handleTouchStart}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-6 pb-24 pt-4 sm:px-7">
            <CompanionTopBar {...model.topBarProps} visible />
            <CompanionSyncInlineStatus workspaceSync={model.workspaceSync} />
            {renderCompanionShellContent(
              {
                hasSnapshot: Boolean(model.workspaceSync.state.workspace_snapshot),
                companionTabConfig: model.companionTabs.config,
                directorySelection: model.directorySelection,
                onBackDirectorySelection: model.topBarProps.onBack ?? (() => undefined),
                onBackToSettingsList: () => model.setSettingsPage('list'),
                onChangeDirectorySelection: model.setDirectorySelection,
                onCompanionTabConfigChange: model.companionTabs.setConfig,
                isBrowseDirectoryOpen: model.isBrowseDirectoryOpen,
                isOnlyReviewOpen: model.isOnlyReviewOpen,
                onOpenSyncSettingsPage: model.setSettingsPage,
                onOpenSyncSettings: () => model.setSettingsPage('sync'),
                onOpenTabsSettings: () => model.setSettingsPage('tabs'),
                onResetDirectorySelection: () => model.setDirectorySelection({ kind: 'root' }),
                onSelectReviewBreadcrumbItem: model.surface.handleSelectBrowseNode,
                reviewBreadcrumbItems: model.reviewBreadcrumbItems,
                settingsPage: model.settingsPage,
                surface: model.surface,
                workspaceError: model.workspaceSync.error,
                workspaceSync: model.workspaceSync
              }
            )}
          </div>
        </div>
      </main>
      <CompanionShellOverlays
        activeSecondaryDestinationId={model.activeSecondaryDestinationId}
        companionTabConfig={model.companionTabs.config}
        isBottomBarDisabled={model.isBottomBarDisabled}
        isCaptureSheetOpen={model.isCaptureSheetOpen}
        isNavigationVisible={model.isNavigationVisible}
        onCaptureSheetOpenChange={model.setIsCaptureSheetOpen}
        onNavigationAction={model.handleNavigationAction}
        onSecondaryDestination={model.handleSecondaryDestination}
        surface={model.surface}
        syncProgress={model.workspaceSync.syncProgress}
      />
    </>
  );
}
