import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const reportRuntimeAppReady = vi.fn();

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState
  });
}

vi.mock('./AppProviders', () => ({ AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('./hooks/useAppController', () => ({ useAppController }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated: vi.fn() }));
vi.mock('./components/AppOverlayStack', () => ({ AppOverlayStack: () => null, prewarmAppOverlayStack: vi.fn() }));
vi.mock('./components/ImportSourceWorkspace', () => ({ prewarmImportSourceWorkspace: vi.fn() }));
vi.mock('./components/WorkspaceSettingsOverlay', () => ({ prewarmWorkspaceSettingsOverlay: vi.fn() }));
vi.mock('./components/WorkspaceLayoutWithReviewQueueDialog', () => ({
  WorkspaceLayoutWithReviewQueueDialog: () => <div>workspace-layout</div>
}));
vi.mock('./components/workspaceRightSidebarPanelLoaders', () => ({ prewarmWorkspaceRightSidebarPanels: vi.fn() }));
vi.mock('./components/useGlobalCaptureNavigation', () => ({ useGlobalCaptureNavigation: () => undefined }));
vi.mock('./hooks/useReadwiseAutoSync', () => ({ useReadwiseAutoSync: () => undefined }));
vi.mock('./hooks/useWorkspaceSyncAppliedRefresh', () => ({
  useWorkspaceContentChangedRefresh: () => undefined,
  useWorkspaceSyncAppliedRefresh: () => undefined
}));
vi.mock('./hooks/useReleaseUpdateCheck', () => ({ useReleaseUpdateCheck: () => undefined }));
vi.mock('../features/settings/context/HotkeySettingsProvider', () => ({
  HotkeySettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../features/settings/context/ReviewSchedulerSettingsProvider', () => ({
  useReviewSchedulerSettings: () => ({ isReviewSchedulerSettingsReady: true })
}));
vi.mock('../shared/diagnostics/workspaceDebugBridge', () => ({ installWorkspaceDebugBridge: () => undefined }));
vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({ readPerformanceDiagnosticsProbe: () => undefined }));
vi.mock('../shared/platform/runtime/demoRuntime', () => ({ useDemoRuntimeState: () => ({ isDemo: false }) }));
vi.mock('../shared/platform/runtimeBootTelemetry', () => ({
  reportRuntimeAppReady,
  reportRuntimeBootStage: vi.fn()
}));

beforeEach(() => {
  useAppController.mockReturnValue({
    hotkeySettings: {},
    layoutProps: {
      imports: { onCloseImportManagement: vi.fn() },
      layoutChrome: { isWorkspaceHydrated: true },
      navigation: { onSelectNode: vi.fn() }
    }
  });
  reportRuntimeAppReady.mockClear();
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
});

it('reports app ready only after the hydrated workspace has painted', async () => {
  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_double_raf' })
    );
  });
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
});

it('reports app ready without waiting for animation frames while the window is hidden', async () => {
  setDocumentVisibility('hidden');
  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_hidden_window' })
    );
  });
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
});
