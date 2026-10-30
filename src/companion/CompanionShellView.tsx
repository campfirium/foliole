import { useRef } from 'react';

import {
  companionMainBottomInsetClassName,
  companionMobileRailClassName,
  companionReviewBottomInsetClassName,
  companionViewportHeightClassName
} from './companionCssCompatibility';
import { canRenderCompanionDirectoryArticle } from './CompanionDirectoryReadableArticleModel';
import { CompanionFlowBrowseBar } from './CompanionFlowBrowseBar';
import { CompanionFlowHistorySurface } from './CompanionFlowHistorySurface';
import { CompanionListViewportProvider } from './CompanionListViewport';
import { CompanionPreviewLifecycle } from './CompanionPreviewLifecycle';
import type { CompanionShellModel } from './CompanionShell';
import { renderCompanionShellContent } from './CompanionShellContent';
import { CompanionShellOverlays } from './CompanionShellOverlays';
import { CompanionShellTopBar } from './CompanionShellTopBar';
import { CompanionWorkspaceActionsProvider } from './CompanionWorkspaceActions';
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
      <div className={`mx-auto flex min-h-full w-full max-w-[760px] flex-col ${companionMobileRailClassName} pt-0 ${bottomInsetClassName}`}>
        <CompanionWorkspaceSyncLoading />
      </div>
    );
  }
  return (
    <div className={`mx-auto flex min-h-full w-full max-w-[760px] flex-col ${companionMobileRailClassName} pt-0 ${bottomInsetClassName}`}>
      {!hasImmersiveReadingContent(model) && <CompanionShellTopBar
        onOpenSyncSettings={() => openCompanionSyncSettings(model)}
        topBarProps={model.topBarProps}
        workspaceSync={model.workspaceSync}
      />}
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
        onExitSearchPdf: model.handleExitSearchPdf,
        onOpenSyncSettingsPage: model.setSettingsPage,
        onOpenSyncSettings: () => model.setSettingsPage('sync'),
        onOpenSearchExternalDocument: model.handleOpenSearchExternalDocument,
        onOpenSearchPdf: model.handleOpenSearchPdf,
        onOpenSearchTopic: model.handleOpenSearchTopic,
        onResetDirectorySelection: () => model.setDirectorySelection({ kind: 'root' }),
        onSelectReviewBreadcrumbItem: model.surface.handleSelectBrowseNode,
        reviewBreadcrumbItems: model.reviewBreadcrumbItems,
        searchExternalDocument: model.searchExternalDocument,
        searchPdfResult: model.searchPdfResult,
        searchMatch: model.searchMatch,
        settingsPage: model.settingsPage,
        surface: model.surface,
        workspaceError: model.workspaceSync.error,
        workspaceSync: model.workspaceSync
      })}
    </div>
  );
}

function isReadableArticleImmersive(model: CompanionShellModel) {
  return Boolean(model.searchExternalDocument || model.searchPdfResult) || ((model.surface.activeAction === 'recent' || model.surface.isFlowBrowsing)
    && (!model.isBrowseDirectoryOpen || canRenderCompanionDirectoryArticle(model))
    && Boolean(model.surface.selectedBrowseNodeId)
    && !model.surface.browsedFolder);
}

function hasImmersiveReadingContent(model: CompanionShellModel): boolean {
  return isReadableArticleImmersive(model) || Boolean(model.surface.activeAction === 'review' && !model.surface.isFlowBrowsing
    && model.surface.effectiveReviewSession.currentCard);
}

function FlowHistorySurface(props: { children: React.ReactNode; model: CompanionShellModel }) {
  const { model } = props;
  return (
    <CompanionWorkspaceActionsProvider key={model.workspaceSync.state.workspace_snapshot?.libraryScope ?? 'preview'}
      snapshot={model.workspaceSync.state.workspace_snapshot} refresh={model.workspaceSync.refreshAfterMutation}
      captureFlow={model.surface.captureFlowHistoryContext}
      currentNodeId={model.surface.readableArticle?.nodeId ?? model.surface.selectedBrowseNodeId}
      flush={() => model.surface.readingActivity.flush()} restoreFlow={model.surface.restoreFlowHistorySession}
      flowActive={model.surface.activeAction === 'review' && !model.surface.isFlowBrowsing}
      applyFlow={model.surface.handleFlowHistory}>
      <CompanionFlowHistorySurface
      active={model.surface.activeAction === 'review' && !model.surface.isFlowBrowsing &&
        !model.surface.readingActivity.editing && model.surface.flowReady}
      busy={model.isBottomBarDisabled} refreshPending={model.surface.historyRefreshPending} historyKey={model.surface.flowHistoryKey}
      onApply={mode => void model.surface.handleFlowHistory(mode)}>{props.children}
      </CompanionFlowHistorySurface>
    </CompanionWorkspaceActionsProvider>
  );
}

export function CompanionShellView(props: { model: CompanionShellModel }) {
  const { model } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <FlowHistorySurface model={model}>
      {import.meta.env.DEV && window.__FOLIOLE_COMPANION_PREVIEW_HOST__ !== undefined ? (
        <CompanionPreviewLifecycle activity={model.surface.readingActivity}
          destination={JSON.stringify([model.surface.activeAction, model.settingsPage, model.activeSecondaryDestinationId,
            model.directorySelection, model.isBrowseDirectoryOpen, model.isOnlyReviewOpen,
            model.searchExternalDocument?.document_id, model.searchPdfResult?.attachment_id, model.isSearchArticleOpen])}
          ready={model.workspaceSync.isWorkspaceSyncStateReady
            && (model.surface.activeAction !== 'review' || model.surface.flowReady)} />
      ) : null}
      <main className={`${companionViewportHeightClassName} bg-companion-base text-foreground`}>
        <div
          className={`${companionViewportHeightClassName} overflow-y-auto`}
          data-testid="companion-scroll-container"
          ref={scrollRef}
          onClick={model.handleContentTap}
          onScroll={model.handleContainerScroll}
          onTouchEnd={model.floatingBar.handleTouchEnd}
          onTouchMove={model.floatingBar.handleTouchMove}
          onTouchStart={model.floatingBar.handleTouchStart}
        >
          <CompanionListViewportProvider scrollRef={scrollRef}
            sortIdentity={`${model.browseSortKey}:${model.browseSortDirection}`}>
            {renderCompanionMainContent(model)}
          </CompanionListViewportProvider>
        </div>
      </main>
      {model.surface.isFlowBrowsing && !model.surface.readingActivity.editing ? (
        <CompanionFlowBrowseBar onResume={model.surface.handleResumeFlow} />
      ) : null}
      <CompanionShellOverlays
        captureDraftScope={model.workspaceSync.state.workspace_snapshot?.libraryScope ?? model.workspaceSync.bootstrapState?.database_path ?? 'preview'}
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
        onCaptureClipboardCreated={model.handleOpenCapturedNode}
        onCaptureSheetOpenChange={model.setIsCaptureSheetOpen}
        onDismissReviewTopic={model.surface.handleDismissReviewTopic}
        onGradeReview={model.surface.handleGradeReview}
        onNavigationAction={model.handleNavigationAction}
        onPostponeReviewTopic={model.surface.handlePostponeReviewTopic}
        onReadReviewTopic={model.surface.handleReadReviewTopic}
        onRevealAnswer={model.surface.handleRevealAnswer}
        onSecondaryDestination={model.handleSecondaryDestination}
      />
    </FlowHistorySurface>
  );
}
