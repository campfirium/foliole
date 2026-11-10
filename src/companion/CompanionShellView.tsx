import { useCallback } from 'react';
import { flushSync } from 'react-dom';

import { ReminderDraftProvider } from '../features/settings/context/ReminderDraftRequest';

import {
  companionMainBottomInsetClassName,
  companionMobileRailClassName,
  companionReviewBottomInsetClassName,
  companionViewportHeightClassName
} from './companionCssCompatibility';
import { canRenderCompanionDirectoryArticle } from './CompanionDirectoryReadableArticleModel';
import { CompanionFlowBrowseBar } from './CompanionFlowBrowseBar';
import { CompanionFlowCaptureContext } from './CompanionFlowCaptureButton';
import { CompanionFlowHistorySurface } from './CompanionFlowHistorySurface';
import { CompanionPageStack } from './CompanionPageStack';
import { CompanionPreviewLifecycle } from './CompanionPreviewLifecycle';
import type { CompanionShellModel } from './CompanionShell';
import { resolveCompanionShellPage } from './CompanionShellContent';
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

function resolveMainPage(model: CompanionShellModel) {
  const bottomInsetClassName = model.surface.activeAction === 'review' && !model.surface.isFlowBrowsing
    ? companionReviewBottomInsetClassName
    : companionMainBottomInsetClassName;
  const page = resolveCompanionShellPage({
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
  });
  const reading = page.reading || hasImmersiveReadingContent(model);
  const content = <div className={`mx-auto flex min-h-full w-full max-w-[760px] flex-col ${companionMobileRailClassName} pt-0 ${bottomInsetClassName}`}>
    {!reading && model.workspaceSync.isWorkspaceSyncStateReady ? <CompanionShellTopBar
      onOpenSyncSettings={() => openCompanionSyncSettings(model)} topBarProps={model.topBarProps}
      workspaceSync={model.workspaceSync} /> : null}
    {model.workspaceSync.isWorkspaceSyncStateReady ? page.content : <CompanionWorkspaceSyncLoading />}
  </div>;
  return { ...page, reading, content };
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
      modeControls={{ mode: model.surface.flowSessionMode, onChange: model.surface.setFlowSessionMode, disabled: model.isBottomBarDisabled }}
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
  const page = resolveMainPage(model);
  const { setSettingsPage, surface: { handleTabAction } } = model;
  const openReminders = useCallback(() => {
    handleTabAction('more');
    setSettingsPage('reminders');
  }, [handleTabAction, setSettingsPage]);
  // Mount and focus the editor during the tap so the WebView can open the keyboard.
  const openFlowCapture = model.surface.activeAction === 'review' || model.surface.isFlowBrowsing
    ? () => flushSync(() => model.setIsCaptureSheetOpen(true)) : null;
  return (
    <ReminderDraftProvider openReminders={openReminders}>
    <CompanionFlowCaptureContext.Provider value={openFlowCapture}>
    <FlowHistorySurface model={model}>
      {import.meta.env.DEV && window.__FOLIOLE_COMPANION_PREVIEW_HOST__ !== undefined ? (
        <CompanionPreviewLifecycle activity={model.surface.readingActivity}
          destination={JSON.stringify([model.surface.activeAction, model.settingsPage, model.activeSecondaryDestinationId,
            model.directorySelection, model.isBrowseDirectoryOpen,
            model.searchExternalDocument?.document_id, model.searchPdfResult?.attachment_id, model.isSearchArticleOpen])}
          ready={model.workspaceSync.isWorkspaceSyncStateReady
            && (model.surface.activeAction !== 'review' || model.surface.flowReady)} />
      ) : null}
      <main className={`relative ${companionViewportHeightClassName} bg-companion-base text-foreground`}>
        <CompanionPageStack key={model.workspaceSync.state.workspace_snapshot?.libraryScope ?? model.workspaceSync.bootstrapState?.database_path ?? 'preview'}
          model={model} pageKey={page.key} reading={page.reading} content={page.content} />
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
        onCaptureImportFile={model.handleImportFile}
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
    </CompanionFlowCaptureContext.Provider>
    </ReminderDraftProvider>
  );
}
