import { useCallback, useEffect, useState } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { WorkspaceRailSettingsProvider } from '../features/settings/context/WorkspaceRailSettingsProvider';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { reportRuntimeAppReady, reportRuntimeBootStage } from '../shared/platform/runtimeBootTelemetry';
import { installWorkspaceDebugBridge } from '../shared/testing/workspaceDebugBridge';
import { ensureWorkspaceHydrated } from '../store/workspaceStoreHydration';

import { CommandPalette } from './components/CommandPalette';
import { CompanionPairingRequestsDialog } from './components/CompanionPairingRequestsDialog';
import { ExternalDocumentPreviewPanel } from './components/ExternalDocumentPreviewPanel';
import type { ExternalDocumentPreviewRequest } from './components/externalDocumentPreviewState';
import { GoToNodePalette } from './components/GoToNodePalette';
import { SearchPalette } from './components/SearchPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useAppController } from './hooks/useAppController';
import { useWorkspaceSyncAppliedRefresh } from './hooks/useWorkspaceSyncAppliedRefresh';

type AppController = ReturnType<typeof useAppController>;

function AppContent() {
  const [externalPreviewRequest, setExternalPreviewRequest] = useState<ExternalDocumentPreviewRequest | null>(null);
  const handleOpenExternalPreview = useCallback((request: ExternalDocumentPreviewRequest) => {
    setExternalPreviewRequest(request);
  }, []);
  const controller = useAppController({
    onOpenExternalPreview: handleOpenExternalPreview
  });
  useWorkspaceSyncAppliedRefresh();

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
          externalPreviewRequest={externalPreviewRequest}
          onCloseExternalPreview={() => setExternalPreviewRequest(null)}
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
  externalPreviewRequest,
  onCloseExternalPreview
}: {
  controller: AppController;
  externalPreviewRequest: ExternalDocumentPreviewRequest | null;
  onCloseExternalPreview: () => void;
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
      <ExternalDocumentPreviewPanel
        onClose={onCloseExternalPreview}
        onOpenImportedNode={(result) => {
          if (result.node_id) {
            controller.layoutProps.navigation.onSelectNode(result.node_id);
          }
          onCloseExternalPreview();
        }}
        onOpenInExternalLibrary={(request) => {
          controller.layoutProps.externalLibrary.onOpenExternalSelection({
            absolutePath: request.absolutePath,
            folderId: request.folderId,
            kind: 'document'
          });
        }}
        request={externalPreviewRequest}
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
