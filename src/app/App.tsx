import { useCallback, useEffect, useState } from 'react';

import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { useReviewSchedulerSettings } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { installWorkspaceDebugBridge } from '../shared/diagnostics/workspaceDebugBridge';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { reportRuntimeAppReady, reportRuntimeBootStage } from '../shared/platform/runtimeBootTelemetry';
import { ensureWorkspaceHydrated } from '../store/workspaceStoreHydration';

import { AppProviders } from './AppProviders';
import { AppOverlayStack, prewarmAppOverlayStack } from './components/AppOverlayStack';
import { prewarmImportSourceWorkspace } from './components/ImportSourceWorkspace';
import { LocalFileEditorSurface } from './components/LocalFileEditorSurface';
import { useGlobalCaptureNavigation } from './components/useGlobalCaptureNavigation';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { prewarmWorkspaceRightSidebarPanels } from './components/workspaceRightSidebarPanelLoaders';
import type { WorkspaceSearchResult } from './components/workspaceSearch';
import { prewarmWorkspaceSettingsOverlay } from './components/WorkspaceSettingsOverlay';
import { useAppController } from './hooks/useAppController';
import { useReadwiseAutoSync } from './hooks/useReadwiseAutoSync';
import { useReleaseUpdateCheck } from './hooks/useReleaseUpdateCheck';
import { useWorkspaceContentChangedRefresh, useWorkspaceSyncAppliedRefresh } from './hooks/useWorkspaceSyncAppliedRefresh';

function AppContent() {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isHelpSearchOpen, setIsHelpSearchOpen] = useState(false);
  const [searchPreviewResult, setSearchPreviewResult] = useState<WorkspaceSearchResult | null>(null);
  const handleOpenSearchPreview = useCallback((result: WorkspaceSearchResult) => {
    setSearchPreviewResult(result);
  }, []);
  const controller = useAppController({
    onOpenHelpSearch: () => setIsHelpSearchOpen(true),
    onOpenSearchPreview: handleOpenSearchPreview,
    onSendFeedback: () => setIsFeedbackOpen(true)
  });
  useWorkspaceSyncAppliedRefresh();
  useWorkspaceContentChangedRefresh();
  useReadwiseAutoSync();
  useReleaseUpdateCheck();
  const { isReviewSchedulerSettingsReady } = useReviewSchedulerSettings();
  const isAppReady = controller.layoutProps.layoutChrome.isWorkspaceHydrated && isReviewSchedulerSettingsReady;
  const handleGlobalCaptureNavigation = useCallback((nodeId: string) => {
    controller.layoutProps.imports.onCloseImportManagement();
    controller.layoutProps.navigation.onSelectNode(nodeId);
  }, [controller.layoutProps.imports, controller.layoutProps.navigation]);
  useGlobalCaptureNavigation(handleGlobalCaptureNavigation);

  useEffect(() => {
    installWorkspaceDebugBridge();
    readPerformanceDiagnosticsProbe();
  }, []);
  useReportAppReadyWhenHydrated(isAppReady);
  usePrewarmInteractiveSurfacesAfterReady(isAppReady);

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
        <LocalFileEditorSurface />
        <AppOverlayStack
          controller={controller}
          isFeedbackOpen={isFeedbackOpen}
          isHelpSearchOpen={isHelpSearchOpen}
          onCloseFeedback={() => setIsFeedbackOpen(false)}
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

function scheduleIdleTask(task: () => void) {
  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(task, { timeout: 2500 });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = globalThis.setTimeout(task, 800);
  return () => globalThis.clearTimeout(timeoutId);
}

function runStartupPrewarmQueue(tasks: Array<() => Promise<unknown>>) {
  let cancelled = false;
  let cancelScheduledTask: (() => void) | undefined;

  const runNextTask = (index: number) => {
    if (cancelled || index >= tasks.length) {
      return;
    }
    const nextTask = tasks[index];
    if (!nextTask) {
      return;
    }
    cancelScheduledTask = scheduleIdleTask(() => {
      void nextTask().catch(() => undefined).finally(() => runNextTask(index + 1));
    });
  };

  runNextTask(0);
  return () => {
    cancelled = true;
    cancelScheduledTask?.();
  };
}

function usePrewarmInteractiveSurfacesAfterReady(isWorkspaceHydrated?: boolean) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return undefined;
    }
    return runStartupPrewarmQueue([
      prewarmAppOverlayStack,
      prewarmWorkspaceSettingsOverlay,
      prewarmWorkspaceRightSidebarPanels,
      prewarmImportSourceWorkspace
    ]);
  }, [isWorkspaceHydrated]);
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
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
