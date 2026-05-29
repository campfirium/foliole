import type { CompanionShellModel } from './CompanionShell';
import { renderCompanionShellContent } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionShellTopBar } from './CompanionShellTopBar';

function openCompanionSyncSettings(model: CompanionShellModel) {
  model.surface.handleTabAction('more');
  model.setSettingsPage('sync');
}

function hasTopBarBackHandler(value: unknown): value is { onBack: () => void } {
  return Boolean(value && typeof value === 'object' && 'onBack' in value && typeof value.onBack === 'function');
}

function getTopBarBackHandler(model: CompanionShellModel) {
  return hasTopBarBackHandler(model.topBarProps)
    ? model.topBarProps.onBack
    : () => undefined;
}

function renderCompanionMainContent(model: CompanionShellModel) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-6 pt-4 pb-16 [padding-left:1.5rem] [padding-right:1.5rem] [padding-bottom:4.5rem] supports-[padding-bottom:calc(0px)]:[padding-bottom:calc(4.5rem+env(safe-area-inset-bottom))] sm:px-7 sm:[padding-left:1.75rem] sm:[padding-right:1.75rem]">
      <CompanionShellTopBar
        onOpenSyncSettings={() => openCompanionSyncSettings(model)}
        topBarProps={model.topBarProps}
        workspaceSync={model.workspaceSync}
      />
      {renderCompanionShellContent({
        hasSnapshot: Boolean(model.workspaceSync.state.workspace_snapshot),
        browseSortDirection: model.browseSortDirection,
        browseSortKey: model.browseSortKey,
        directorySelection: model.directorySelection,
        onBackDirectorySelection: getTopBarBackHandler(model),
        onBackToSettingsList: () => model.setSettingsPage('list'),
        onChangeDirectorySelection: model.setDirectorySelection,
        onChangeBrowseSortDirection: model.setBrowseSortDirection,
        onChangeBrowseSortKey: model.setBrowseSortKey,
        isBrowseDirectoryOpen: model.isBrowseDirectoryOpen,
        isOnlyReviewOpen: model.isOnlyReviewOpen,
        onOpenSyncSettingsPage: model.setSettingsPage,
        onOpenSyncSettings: () => model.setSettingsPage('sync'),
        onResetDirectorySelection: () => model.setDirectorySelection({ kind: 'root' }),
        onSelectReviewBreadcrumbItem: model.surface.handleSelectBrowseNode,
        reviewBreadcrumbItems: model.reviewBreadcrumbItems,
        settingsPage: model.settingsPage,
        surface: model.surface,
        workspaceError: model.workspaceSync.error,
        workspaceSync: model.workspaceSync
      })}
    </div>
  );
}

export function CompanionShellView(props: { model: CompanionShellModel }) {
  const { model } = props;
  return (
    <>
      <main className="h-screen h-dvh bg-companion-base text-foreground">
        <div
          className="h-screen h-dvh overflow-y-auto"
          data-testid="companion-scroll-container"
          onClick={model.handleContentTap}
          onScroll={model.handleContainerScroll}
          onTouchEnd={model.floatingBar.handleTouchEnd}
          onTouchMove={model.floatingBar.handleTouchMove}
          onTouchStart={model.floatingBar.handleTouchStart}
        >
          {renderCompanionMainContent(model)}
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
      />
    </>
  );
}
