import {
  companionMainBottomInsetClassName,
  companionMobileRailClassName,
  companionReviewBottomInsetClassName,
  companionViewportHeightClassName
} from './companionCssCompatibility';
import type { CompanionShellModel } from './CompanionShell';
import { renderCompanionShellContent } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionShellTopBar } from './CompanionShellTopBar';
import { CompanionWorkspaceSyncLoading } from './CompanionWorkspaceSyncLoading';

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
  const bottomInsetClassName = model.isReviewTaskActive
    ? companionReviewBottomInsetClassName
    : companionMainBottomInsetClassName;
  if (!model.workspaceSync.isWorkspaceSyncStateReady) {
    return (
      <div className={`mx-auto flex min-h-full w-full max-w-[760px] flex-col ${companionMobileRailClassName} pt-4 ${bottomInsetClassName}`}>
        <CompanionWorkspaceSyncLoading />
      </div>
    );
  }
  return (
    <div className={`mx-auto flex min-h-full w-full max-w-[760px] flex-col ${companionMobileRailClassName} pt-4 ${bottomInsetClassName}`}>
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
        isSearchArticleOpen: model.isSearchArticleOpen,
        onExitSearchArticle: model.handleExitSearchArticle,
        onExitSearchExternalDocument: model.handleExitSearchExternalDocument,
        onOpenSyncSettingsPage: model.setSettingsPage,
        onOpenSyncSettings: () => model.setSettingsPage('sync'),
        onOpenSearchExternalDocument: model.handleOpenSearchExternalDocument,
        onOpenSearchTopic: model.handleOpenSearchTopic,
        onResetDirectorySelection: () => model.setDirectorySelection({ kind: 'root' }),
        onSelectReviewBreadcrumbItem: model.surface.handleSelectBrowseNode,
        reviewBreadcrumbItems: model.reviewBreadcrumbItems,
        searchExternalDocument: model.searchExternalDocument,
        settingsPage: model.settingsPage,
        surface: model.surface,
        workspaceError: model.workspaceSync.error,
        workspaceSync: model.workspaceSync
      })}
    </div>
  );
}

function isReadableArticleImmersive(model: CompanionShellModel) {
  return Boolean(model.searchExternalDocument) || (model.surface.activeAction === 'recent'
    && Boolean(model.surface.readableArticle)
    && Boolean(model.surface.selectedBrowseNodeId)
    && !model.surface.browsedFolder);
}

export function CompanionShellView(props: { model: CompanionShellModel }) {
  const { model } = props;
  return (
    <>
      <main className={`${companionViewportHeightClassName} bg-companion-base text-foreground`}>
        <div
          className={`${companionViewportHeightClassName} overflow-y-auto`}
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
        activeAction={model.surface.activeAction}
        companionTabConfig={model.companionTabs.config}
        currentReviewCard={model.surface.effectiveReviewSession.currentCard}
        isBottomBarDisabled={model.isBottomBarDisabled}
        isCaptureSheetOpen={model.isCaptureSheetOpen}
        isNavigationVisible={model.isNavigationVisible}
        isReadableArticleImmersive={isReadableArticleImmersive(model)}
        isReviewAnswerRevealed={model.surface.isAnswerRevealed}
        onCaptureSave={model.handleSaveCaptureText}
        onCaptureSheetOpenChange={model.setIsCaptureSheetOpen}
        onDismissReviewTopic={model.surface.handleDismissReviewTopic}
        onGradeReview={model.surface.handleGradeReview}
        onNavigationAction={model.handleNavigationAction}
        onPostponeReviewTopic={model.surface.handlePostponeReviewTopic}
        onReadReviewTopic={model.surface.handleReadReviewTopic}
        onRevealAnswer={model.surface.handleRevealAnswer}
        onSecondaryDestination={model.handleSecondaryDestination}
      />
    </>
  );
}
