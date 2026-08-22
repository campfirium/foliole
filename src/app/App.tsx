import { useCallback, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { useReviewSchedulerSettings } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { installWorkspaceDebugBridge } from '../shared/diagnostics/workspaceDebugBridge';
import type { AppLanguagePreference } from '../shared/localization/appLanguage';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { useDemoRuntimeState } from '../shared/platform/runtime/demoRuntime';
import { reportRuntimeAppReady, reportRuntimeBootStage } from '../shared/platform/runtimeBootTelemetry';
import { ensureWorkspaceHydrated } from '../store/workspaceStoreHydration';

import { AppProviders } from './AppProviders';
import { AppOverlayStack, prewarmAppOverlayStack } from './components/AppOverlayStack';
import { prewarmImportSourceWorkspace } from './components/ImportSourceWorkspace';
import { useGlobalCaptureNavigation } from './components/useGlobalCaptureNavigation';
import { WorkspaceDemoViewportGate } from './components/WorkspaceDemoViewportGate';
import { WorkspaceLayoutWithReviewQueueDialog } from './components/WorkspaceLayoutWithReviewQueueDialog';
import { prewarmWorkspaceRightSidebarPanels } from './components/workspaceRightSidebarPanelLoaders';
import type { WorkspaceSearchResult } from './components/workspaceSearch';
import { prewarmWorkspaceSettingsOverlay } from './components/WorkspaceSettingsOverlay';
import { useAppController } from './hooks/useAppController';
import { useReadwiseAutoSync } from './hooks/useReadwiseAutoSync';
import { useReleaseUpdateCheck } from './hooks/useReleaseUpdateCheck';
import { useSystemEntryDisplayNamesHydration } from './hooks/useSystemEntryDisplayNamesHydration';
import { useWorkspaceContentChangedRefresh, useWorkspaceSyncAppliedRefresh } from './hooks/useWorkspaceSyncAppliedRefresh';

function AppContent() {
  useSystemEntryDisplayNamesHydration();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isHelpSearchOpen, setIsHelpSearchOpen] = useState(false);
  const [searchPreviewResult, setSearchPreviewResult] = useState<WorkspaceSearchResult | null>(null);
  const handleOpenSearchPreview = useCallback((result: WorkspaceSearchResult) => {
    setSearchPreviewResult(result);
  }, []);
  const controller = useAppController({
    onOpenHelpSearch: () => setIsHelpSearchOpen(true),
    onReviewQueueEmpty: () => undefined,
    onOpenSearchPreview: handleOpenSearchPreview,
    onSendFeedback: () => setIsFeedbackOpen(true)
  });
  useWorkspaceSyncAppliedRefresh();
  useWorkspaceContentChangedRefresh();
  useReadwiseAutoSync();
  useReleaseUpdateCheck();
  const { isDemo } = useDemoRuntimeState();
  const { isReviewSchedulerSettingsReady } = useReviewSchedulerSettings();
  const isAppReady = Boolean(controller.layoutProps.layoutChrome.isWorkspaceHydrated && isReviewSchedulerSettingsReady);
  const [hasReportedAppReady, setHasReportedAppReady] = useState(false);
  const handleGlobalCaptureNavigation = useCallback((nodeId: string) => {
    controller.layoutProps.imports.onCloseImportManagement();
    controller.layoutProps.navigation.onSelectNode(nodeId);
  }, [controller.layoutProps.imports, controller.layoutProps.navigation]);
  useGlobalCaptureNavigation(handleGlobalCaptureNavigation);

  useEffect(() => {
    installWorkspaceDebugBridge();
    readPerformanceDiagnosticsProbe();
  }, []);
  useReportAppReadyGate(isAppReady, {
    isReviewSchedulerSettingsReady,
    isWorkspaceHydrated: controller.layoutProps.layoutChrome.isWorkspaceHydrated
  });
  useReportAppReadyWhenHydrated(isAppReady, setHasReportedAppReady);
  usePrewarmInteractiveSurfacesAfterReady(hasReportedAppReady, isDemo);

  return (
    <HotkeySettingsProvider {...controller.hotkeySettings}>
      <>
        <WorkspaceDemoViewportGate>
          <WorkspaceLayoutWithReviewQueueDialog controller={controller} />
        </WorkspaceDemoViewportGate>
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
function useReportAppReadyGate(
  isAppReady: boolean,
  gate: { isReviewSchedulerSettingsReady: boolean; isWorkspaceHydrated: boolean | undefined }
) {
  useEffect(() => {
    if (isAppReady) {
      return;
    }
    reportRuntimeBootStage('app_ready_gate_pending', gate);
  }, [gate.isReviewSchedulerSettingsReady, gate.isWorkspaceHydrated, isAppReady]);
}

function useReportAppReadyWhenHydrated(
  isWorkspaceHydrated: boolean | undefined,
  setHasReportedAppReady: Dispatch<SetStateAction<boolean>>
) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      setHasReportedAppReady(false);
      return;
    }
    reportRuntimeBootStage('app_ready_signal_registration', {
      source: 'workspace_hydrated'
    });
    if (document.visibilityState === 'hidden') {
      document.body.dataset.bootSkeleton = 'hidden';
      setHasReportedAppReady(true);
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
        setHasReportedAppReady(true);
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
  }, [isWorkspaceHydrated, setHasReportedAppReady]);
}

function scheduleIdleTask(task: () => void) {
  if (typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function') {
    const cancelIdleCallback = window.cancelIdleCallback.bind(window);
    const idleId = window.requestIdleCallback(task, { timeout: 2500 });
    return () => cancelIdleCallback(idleId);
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

function usePrewarmInteractiveSurfacesAfterReady(hasReportedAppReady?: boolean, isDemo = false) {
  useEffect(() => {
    if (!hasReportedAppReady) {
      return undefined;
    }
    const prewarmTasks = [
      prewarmAppOverlayStack,
      ...(!isDemo ? [prewarmWorkspaceSettingsOverlay] : []),
      prewarmWorkspaceRightSidebarPanels,
      prewarmImportSourceWorkspace
    ];
    return runStartupPrewarmQueue(prewarmTasks);
  }, [hasReportedAppReady, isDemo]);
}

interface AppProps {
  initialLanguagePreference?: AppLanguagePreference | undefined;
  providerBridge?: ReactNode;
}

export function App({ initialLanguagePreference, providerBridge }: AppProps = {}) {
  useEffect(() => {
    let cancelled = false;
    let didRequestHydration = false;
    let secondFrameId = 0;
    const requestHydration = () => {
      if (cancelled || didRequestHydration) {
        return;
      }
      didRequestHydration = true;
      void ensureWorkspaceHydrated();
    };
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        requestHydration();
      });
    });
    const fallbackTimeoutId = window.setTimeout(requestHydration, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimeoutId);
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, []);

  return (
    <AppProviders initialLanguagePreference={initialLanguagePreference}>
      {providerBridge}
      <AppContent />
    </AppProviders>
  );
}
