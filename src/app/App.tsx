import { useCallback, useEffect, useState } from 'react';

import { AppearanceSettingsProvider } from '../features/settings/context/AppearanceSettingsProvider';
import { HotkeySettingsProvider } from '../features/settings/context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../features/settings/context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../features/settings/context/ReviewSchedulerSettingsProvider';
import { readPerformanceDiagnosticsProbe } from '../shared/platform/performanceDiagnosticsProbe';
import { reportRuntimeAppReady, reportRuntimeBootStage } from '../shared/platform/bridge';
import { installWorkspaceDebugBridge } from '../shared/testing/workspaceDebugBridge';
import { ensureWorkspaceHydrated } from '../store/workspaceStore';

import { CommandPalette } from './components/CommandPalette';
import { CompanionPairingRequestsDialog } from './components/CompanionPairingRequestsDialog';
import { ExternalDocumentPreviewPanel } from './components/ExternalDocumentPreviewPanel';
import type { ExternalDocumentPreviewRequest } from './components/externalDocumentPreviewState';
import { GoToNodePalette } from './components/GoToNodePalette';
import { SearchPalette } from './components/SearchPalette';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { useAppController } from './hooks/useAppController';
import { useWorkspaceSyncAppliedRefresh } from './hooks/useWorkspaceSyncAppliedRefresh';

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

  useEffect(() => {
    if (!controller.layoutProps.isWorkspaceHydrated) {
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
  }, [controller.layoutProps.isWorkspaceHydrated]);

  return (
    <HotkeySettingsProvider {...controller.hotkeySettings}>
      <>
        <WorkspaceLayout {...controller.layoutProps} />
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
          onClose={() => setExternalPreviewRequest(null)}
          onOpenImportedNode={(result) => {
            if (result.node_id) {
              controller.layoutProps.onSelectNode(result.node_id);
            }
            setExternalPreviewRequest(null);
          }}
          onOpenInExternalLibrary={(request) => {
            controller.layoutProps.onOpenExternalSelection({
              absolutePath: request.absolutePath,
              folderId: request.folderId,
              kind: 'document'
            });
          }}
          request={externalPreviewRequest}
        />
      </>
    </HotkeySettingsProvider>
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
          <AppContent />
        </ReviewSchedulerSettingsProvider>
      </MouseGestureSettingsProvider>
    </AppearanceSettingsProvider>
  );
}
