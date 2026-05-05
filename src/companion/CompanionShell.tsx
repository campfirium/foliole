import { useCallback, useEffect, useMemo, useState, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { renderCompanionShellContent, resolveCompanionTopBarProps } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionSyncInlineStatus } from './CompanionSyncInlineStatus';
import type { CompanionSecondaryDestinationId } from './CompanionTabsConfig';
import { CompanionTopBar } from './CompanionTopBar';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionSyncSettingsPage, type CompanionSettingsPage } from './useCompanionSyncSettingsPage';
import { useCompanionTabsConfig } from './useCompanionTabsConfig';
import { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import { useFloatingBarVisibility } from './useFloatingBarVisibility';

function useCompanionNavigationVisibility(
  floatingBar: ReturnType<typeof useFloatingBarVisibility>,
  isReviewTaskActive: boolean
) {
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

  return {
    handleContentTap,
    isNavigationVisible
  };
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

function useCompanionTopBarProps(args: {
  isBrowseDirectoryOpen: boolean;
  isOnlyReviewOpen: boolean;
  setIsBrowseDirectoryOpen(open: boolean): void;
  setIsCaptureSheetOpen(open: boolean): void;
  setIsOnlyReviewOpen(open: boolean): void;
  setSettingsPage(page: CompanionSettingsPage): void;
  settingsPage: CompanionSettingsPage;
  surface: ReturnType<typeof useCompanionArticleSurface>;
}) {
  return resolveCompanionTopBarProps(
    args.surface,
    args.settingsPage,
    args.isBrowseDirectoryOpen,
    args.isOnlyReviewOpen,
    () => args.setIsBrowseDirectoryOpen(true),
    () => args.setIsBrowseDirectoryOpen(false),
    () => args.setIsCaptureSheetOpen(true),
    () => args.setIsOnlyReviewOpen(true),
    () => args.setIsOnlyReviewOpen(false),
    () => args.surface.handleTabAction('recent'),
    () => args.setSettingsPage('list'),
    () => args.setSettingsPage('sync')
  );
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
  const handleContainerScroll = useCompanionShellScrollHandler(floatingBar, surface);
  const topBarProps = useCompanionTopBarProps({
    isBrowseDirectoryOpen,
    isOnlyReviewOpen,
    setIsBrowseDirectoryOpen,
    setIsCaptureSheetOpen,
    setIsOnlyReviewOpen,
    setSettingsPage,
    settingsPage,
    surface,
  });
  const handleNavigationAction = (action: CompanionTabAction) => surface.handleTabAction(action);
  const secondaryDestinations = useCompanionSecondaryDestinations({
    activeAction: surface.activeAction,
    isBrowseDirectoryOpen,
    isOnlyReviewOpen,
    settingsPage,
    setIsBrowseDirectoryOpen,
    setIsOnlyReviewOpen,
    setSettingsPage,
    surface
  });
  useResetCompanionSubsurfaces({ activeAction: surface.activeAction, setIsBrowseDirectoryOpen, setIsOnlyReviewOpen });

  return {
    activeSecondaryDestinationId: secondaryDestinations.activeSecondaryDestinationId,
    companionTabs,
    floatingBar,
    handleContainerScroll,
    handleContentTap: reviewChrome.handleContentTap,
    handleNavigationAction,
    handleSecondaryDestination: secondaryDestinations.handleSecondaryDestination,
    isBottomBarDisabled: reviewChrome.isBottomBarDisabled,
    isBrowseDirectoryOpen,
    isCaptureSheetOpen,
    isOnlyReviewOpen,
    isNavigationVisible: reviewChrome.isNavigationVisible,
    isReviewTaskActive: reviewChrome.isReviewTaskActive,
    reviewBreadcrumbItems: reviewChrome.reviewBreadcrumbItems,
    setIsCaptureSheetOpen,
    setSettingsPage,
    settingsPage,
    surface,
    topBarProps,
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
                onBackToSettingsList: () => model.setSettingsPage('list'),
                onCompanionTabConfigChange: model.companionTabs.setConfig,
                isBrowseDirectoryOpen: model.isBrowseDirectoryOpen,
                isOnlyReviewOpen: model.isOnlyReviewOpen,
                onOpenSyncSettingsPage: model.setSettingsPage,
                onOpenSyncSettings: () => model.setSettingsPage('sync'),
                onOpenTabsSettings: () => model.setSettingsPage('tabs'),
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
