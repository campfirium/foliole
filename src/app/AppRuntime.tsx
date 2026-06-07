import { Suspense, lazy, useCallback, useEffect, useState } from 'react';

import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { installWorkspaceDebugBridge } from '../shared/diagnostics/workspaceDebugBridge';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { reportRuntimeAppReady, reportRuntimeBootStage } from '../shared/platform/runtimeBootTelemetry';

import { AppProviders } from './AppProviders';
import { CompanionPairingRequestsDialog } from './components/CompanionPairingRequestsDialog';
import { EpubImportReleaseModeDialog } from './components/EpubImportReleaseModeDialog';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import type { WorkspaceSearchResult } from './components/workspaceSearch';
import { useAppController } from './hooks/useAppController';
import { useReadwiseAutoSync } from './hooks/useReadwiseAutoSync';
import { useReleaseUpdateCheck } from './hooks/useReleaseUpdateCheck';
import { useWorkspaceContentChangedRefresh, useWorkspaceSyncAppliedRefresh } from './hooks/useWorkspaceSyncAppliedRefresh';

type AppController = ReturnType<typeof useAppController>;

const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((module) => ({ default: module.CommandPalette }))
);
const GoToNodePalette = lazy(() =>
  import('./components/GoToNodePalette').then((module) => ({ default: module.GoToNodePalette }))
);
const HelpSearch = lazy(() =>
  import('./components/HelpSearch').then((module) => ({ default: module.HelpSearch }))
);
const ReviewSourceTopicDeleteDialog = lazy(() =>
  import('./components/ReviewSourceTopicDeleteDialog').then((module) => ({
    default: module.ReviewSourceTopicDeleteDialog
  }))
);
const ReviewTopicDelayPanel = lazy(() =>
  import('./components/ReviewTopicDelayPanel').then((module) => ({
    default: module.ReviewTopicDelayPanel
  }))
);
const SearchPalette = lazy(() =>
  import('./components/SearchPalette').then((module) => ({ default: module.SearchPalette }))
);
const SearchResultPreviewPanel = lazy(() =>
  import('./components/SearchResultPreviewPanel').then((module) => ({ default: module.SearchResultPreviewPanel }))
);

function AppContent() {
  const [isHelpSearchOpen, setIsHelpSearchOpen] = useState(false);
  const [searchPreviewResult, setSearchPreviewResult] = useState<WorkspaceSearchResult | null>(null);
  const handleOpenSearchPreview = useCallback((result: WorkspaceSearchResult) => {
    setSearchPreviewResult(result);
  }, []);
  const controller = useAppController({
    onOpenHelpSearch: () => setIsHelpSearchOpen(true),
    onOpenSearchPreview: handleOpenSearchPreview
  });
  useWorkspaceSyncAppliedRefresh();
  useWorkspaceContentChangedRefresh();
  useReadwiseAutoSync();
  useReleaseUpdateCheck();

  useEffect(() => {
    installWorkspaceDebugBridge();
    readPerformanceDiagnosticsProbe();
  }, []);
  useReportAppReadyWhenHydrated(controller.layoutProps.layoutChrome.isWorkspaceHydrated);

  const workspaceLayoutProps = {
    ...controller.layoutProps,
    settings: {
      ...controller.layoutProps.settings,
      onRunRailAction: controller.paletteState.onRunCommand
    }
  };

  return (
    <HotkeySettingsProvider {...controller.hotkeySettings}>
      <>
        <WorkspaceLayout {...workspaceLayoutProps} />
        <AppOverlays
          controller={controller}
          isHelpSearchOpen={isHelpSearchOpen}
          onCloseHelpSearch={() => setIsHelpSearchOpen(false)}
          onCloseSearchPreview={() => setSearchPreviewResult(null)}
          searchPreviewResult={searchPreviewResult}
        />
      </>
    </HotkeySettingsProvider>
  );
}

function useReportAppReadyWhenHydrated(isWorkspaceHydrated?: boolean) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    reportRuntimeBootStage('app_ready_signal_registration', {
      source: 'workspace_hydrated'
    });
    if (document.visibilityState === 'hidden') {
      document.body.dataset.bootSkeleton = 'hidden';
      reportRuntimeAppReady({
        href: window.location.href,
        readyState: document.readyState,
        source: 'workspace_hydrated_hidden_window'
      });
      return;
    }
    let cancelled = false;
    let secondFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        document.body.dataset.bootSkeleton = 'hidden';
        reportRuntimeBootStage('app_ready_signal_received', {
          readyState: document.readyState,
          source: 'workspace_hydrated_double_raf'
        });
        reportRuntimeAppReady({
          href: window.location.href,
          readyState: document.readyState,
          source: 'workspace_hydrated_double_raf'
        });
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [isWorkspaceHydrated]);
}

function AppOverlays({
  controller,
  isHelpSearchOpen,
  onCloseHelpSearch,
  onCloseSearchPreview,
  searchPreviewResult
}: {
  controller: AppController;
  isHelpSearchOpen: boolean;
  onCloseHelpSearch: () => void;
  onCloseSearchPreview: () => void;
  searchPreviewResult: WorkspaceSearchResult | null;
}) {
  const t = useTranslation();

  return (
    <>
      <CompanionPairingRequestsDialog />
      <EpubImportReleaseModeDialog />
      <Suspense fallback={null}>
        {controller.paletteState.isOpen ? <CommandPalette {...controller.paletteState} /> : null}
        {isHelpSearchOpen ? (
          <HelpSearch
            isOpen={isHelpSearchOpen}
            onClose={onCloseHelpSearch}
          />
        ) : null}
        {controller.searchState.isOpen ? <SearchPalette {...controller.searchState} /> : null}
        {controller.goToNodeState.isOpen ? <GoToNodePalette {...controller.goToNodeState} /> : null}
        {controller.moveToNodeState.isOpen ? (
          <GoToNodePalette
            {...controller.moveToNodeState}
            dialogLabel={t('desktop.palette.move.dialog')}
            emptyLabel={t('desktop.palette.move.empty')}
            inputLabel={t('desktop.palette.move.input')}
            noResultsLabel={t('desktop.palette.move.noResults')}
            onSelectNode={controller.moveToNodeState.onOpenNode}
            placeholder={t('desktop.palette.node.placeholder')}
          />
        ) : null}
        {controller.reviewSourceTopicDeleteDialog.isOpen ? (
          <ReviewSourceTopicDeleteDialog {...controller.reviewSourceTopicDeleteDialog} />
        ) : null}
        {controller.reviewTopicDelayPanel?.isOpen ? <ReviewTopicDelayPanel {...controller.reviewTopicDelayPanel} /> : null}
        {searchPreviewResult ? (
          <SearchResultPreviewPanel
            nodesById={controller.layoutProps.nodeList.nodesById}
            onClose={onCloseSearchPreview}
            onOpenResult={(result) => {
              controller.searchState.onOpenResult(result);
              onCloseSearchPreview();
            }}
            result={searchPreviewResult}
          />
        ) : null}
      </Suspense>
    </>
  );
}

export function AppRuntime() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
