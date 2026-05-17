import { useCallback, useEffect, useState } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../features/settings/context/WorkspaceRailSettingsProvider';
import { installWorkspaceDebugBridge } from '../shared/diagnostics/workspaceDebugBridge';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import {
  reportRuntimeAppReady,
  reportRuntimeBootStage
} from '../shared/platform/runtimeBootTelemetry';
import { ensureWorkspaceHydrated } from '../store/workspaceStoreHydration';

import { CommandPalette } from './components/CommandPalette';
import { CompanionPairingRequestsDialog } from './components/CompanionPairingRequestsDialog';
import { GoToNodePalette } from './components/GoToNodePalette';
import { SearchPalette } from './components/SearchPalette';
import { SearchResultPreviewPanel } from './components/SearchResultPreviewPanel';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import type { WorkspaceSearchResult } from './components/workspaceSearch';
import { useAppController } from './hooks/useAppController';
import { useReadwiseAutoSync } from './hooks/useReadwiseAutoSync';
import {
  useWorkspaceContentChangedRefresh,
  useWorkspaceSyncAppliedRefresh
} from './hooks/useWorkspaceSyncAppliedRefresh';

type AppController = ReturnType<typeof useAppController>;

function AppContent() {
  const [searchPreviewResult, setSearchPreviewResult] = useState<WorkspaceSearchResult | null>(null);
  const handleOpenSearchPreview = useCallback((result: WorkspaceSearchResult) => {
    setSearchPreviewResult(result);
  }, []);
  const controller = useAppController({
    onOpenSearchPreview: handleOpenSearchPreview
  });
  useWorkspaceSyncAppliedRefresh();
  useWorkspaceContentChangedRefresh();
  useReadwiseAutoSync();

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
  onCloseSearchPreview,
  searchPreviewResult
}: {
  controller: AppController;
  onCloseSearchPreview: () => void;
  searchPreviewResult: WorkspaceSearchResult | null;
}) {
  return (
    <>
      <CompanionPairingRequestsDialog />
      <CommandPalette {...controller.paletteState} />
      <SearchPalette {...controller.searchState} />
      <GoToNodePalette {...controller.goToNodeState} />
      <GoToNodePalette
        {...controller.moveToNodeState}
        dialogLabel="Move to"
        emptyLabel="Search destinations"
        inputLabel="Move to"
        noResultsLabel="No matching destinations"
        onSelectNode={controller.moveToNodeState.onOpenNode}
        placeholder="Type a title..."
      />
      <SearchResultPreviewPanel
        nodesById={controller.layoutProps.nodeList.nodesById}
        onClose={onCloseSearchPreview}
        onOpenResult={(result) => {
          controller.searchState.onOpenResult(result);
          onCloseSearchPreview();
        }}
        result={searchPreviewResult}
      />
    </>
  );
}

export function App() {
  useEffect(() => {
    let cancelled = false;
    let secondFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        if (!cancelled) {
          void ensureWorkspaceHydrated();
        }
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, []);

  return (
    <AppearanceSettingsProvider>
      <MouseGestureSettingsProvider>
        <ReviewSchedulerSettingsProvider>
          <WorkspaceRailSettingsProvider>
            <AppContent />
          </WorkspaceRailSettingsProvider>
        </ReviewSchedulerSettingsProvider>
      </MouseGestureSettingsProvider>
    </AppearanceSettingsProvider>
  );
}
