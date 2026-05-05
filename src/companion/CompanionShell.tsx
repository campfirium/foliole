import { useCallback, useMemo, useState, type UIEvent as ReactUIEvent } from 'react';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { useReviewBreadcrumbItems } from './companionReviewBreadcrumbs';
import { renderCompanionShellContent, resolveCompanionTopBarProps } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionSyncInlineStatus } from './CompanionSyncInlineStatus';
import { CompanionTopBar } from './CompanionTopBar';
import { useCompanionArticleSurface } from './useCompanionArticleSurface';
import { useCompanionSyncSettingsPage } from './useCompanionSyncSettingsPage';
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

function useCompanionShellModel(bootstrapState: NativeCompanionBootstrapState) {
  const floatingBar = useFloatingBarVisibility('companion-bottom-tabs');
  const [isCaptureSheetOpen, setIsCaptureSheetOpen] = useState(false);
  const workspaceSync = useCompanionWorkspaceSync(bootstrapState);
  const surface = useCompanionArticleSurface(workspaceSync, floatingBar);
  const { setSettingsPage, settingsPage } = useCompanionSyncSettingsPage({
    activeAction: surface.activeAction,
    syncOnboardingStatus: workspaceSync.state.sync_onboarding_status
  });
  const isBottomBarDisabled = surface.isSubmittingGrade || surface.isSubmittingReadingAction;
  const isReviewTaskActive = surface.activeAction === 'review' && Boolean(surface.reviewSession.currentCard);
  const reviewBreadcrumbItems = useReviewBreadcrumbItems(
    workspaceSync.state.workspace_snapshot,
    surface.reviewSession.currentCard?.nodeId ?? null
  );
  const { handleContentTap, isNavigationVisible } = useCompanionNavigationVisibility(
    floatingBar,
    isReviewTaskActive
  );
  const handleContainerScroll = useCompanionShellScrollHandler(floatingBar, surface);
  const topBarProps = resolveCompanionTopBarProps(surface, settingsPage, () => setSettingsPage('list'));
  const handleNavigationAction = (action: CompanionTabAction) => {
    if (action === 'capture') {
      setIsCaptureSheetOpen(true);
      return;
    }
    surface.handleTabAction(action);
  };

  return {
    floatingBar,
    handleContainerScroll,
    handleContentTap,
    handleNavigationAction,
    isBottomBarDisabled,
    isCaptureSheetOpen,
    isNavigationVisible,
    isReviewTaskActive,
    reviewBreadcrumbItems,
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
            <CompanionTopBar {...model.topBarProps} visible={!model.isReviewTaskActive} />
            <CompanionSyncInlineStatus workspaceSync={model.workspaceSync} />
            {renderCompanionShellContent(
              {
                hasSnapshot: Boolean(model.workspaceSync.state.workspace_snapshot),
                onBackToSettingsList: () => model.setSettingsPage('list'),
                onOpenSyncSettings: () => model.setSettingsPage('sync'),
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
        isBottomBarDisabled={model.isBottomBarDisabled}
        isCaptureSheetOpen={model.isCaptureSheetOpen}
        isNavigationVisible={model.isNavigationVisible}
        onCaptureSheetOpenChange={model.setIsCaptureSheetOpen}
        onNavigationAction={model.handleNavigationAction}
        surface={model.surface}
      />
    </>
  );
}
