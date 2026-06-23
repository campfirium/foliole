import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const prewarmAppOverlayStack = vi.fn(() => Promise.resolve());
const prewarmImportSourceWorkspace = vi.fn(() => Promise.resolve());
const prewarmWorkspaceRightSidebarPanels = vi.fn(() => Promise.resolve());
const prewarmWorkspaceSettingsOverlay = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reviewSettingsProviderMock = vi.hoisted(() => ({ isReady: false }));

vi.mock('./hooks/useAppController', () => ({ useAppController }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated: vi.fn(() => Promise.resolve()) }));
vi.mock('./components/WorkspaceSettingsOverlay', () => ({ prewarmWorkspaceSettingsOverlay }));
vi.mock('./components/AppOverlayStack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/AppOverlayStack')>()),
  prewarmAppOverlayStack
}));
vi.mock('./components/ImportSourceWorkspace', () => ({ prewarmImportSourceWorkspace }));
vi.mock('./components/workspaceRightSidebarPanelLoaders', () => ({ prewarmWorkspaceRightSidebarPanels }));
vi.mock('../shared/platform/runtimeBootTelemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/runtimeBootTelemetry')>()),
  reportRuntimeAppReady,
  reportRuntimeBootStage: vi.fn()
}));
vi.mock('../features/settings/context/AppearanceSettingsProvider', () => ({
  AppearanceSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../features/settings/context/MouseGestureSettingsProvider', () => ({
  MouseGestureSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../features/settings/context/ReviewSchedulerSettingsProvider', () => ({
  ReviewSchedulerSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReviewSchedulerSettings: () => ({ isReviewSchedulerSettingsReady: reviewSettingsProviderMock.isReady })
}));
vi.mock('../features/settings/context/HotkeySettingsProvider', () => ({
  HotkeySettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../shared/localization/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocalization: () => ({ t: (key: string) => key }),
  useTranslation: () => (key: string) => key
}));
vi.mock('./components/LocalFileEditorSurface', () => ({ LocalFileEditorSurface: () => null }));
vi.mock('./components/WorkspaceLayout', () => ({ WorkspaceLayout: () => <div>workspace-layout</div> }));
vi.mock('./components/WorkspaceLayoutWithReviewQueueDialog', () => ({
  WorkspaceLayoutWithReviewQueueDialog: () => <div>workspace-layout</div>
}));
vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({ readPerformanceDiagnosticsProbe: () => undefined }));
vi.mock('../shared/diagnostics/workspaceDebugBridge', () => ({ installWorkspaceDebugBridge: () => undefined }));

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibilityState });
}

beforeEach(() => {
  useAppController.mockReturnValue({
    goToNodeState: { isOpen: false },
    hotkeySettings: {},
    layoutProps: { layoutChrome: { isWorkspaceHydrated: true }, settings: {} },
    moveToNodeState: { isOpen: false },
    paletteState: { isOpen: false },
    reviewSourceTopicDeleteDialog: { isOpen: false },
    searchState: { isOpen: false }
  });
  prewarmAppOverlayStack.mockClear();
  prewarmImportSourceWorkspace.mockClear();
  prewarmWorkspaceRightSidebarPanels.mockClear();
  prewarmWorkspaceSettingsOverlay.mockClear();
  reportRuntimeAppReady.mockClear();
  reviewSettingsProviderMock.isReady = false;
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    value: vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 20 });
      return 1;
    })
  });
  Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });
});

it('waits for review scheduler settings before reporting app ready or prewarming', async () => {
  const { App } = await import('./App');
  const view = render(<App />);

  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
  expect(prewarmWorkspaceSettingsOverlay).not.toHaveBeenCalled();

  reviewSettingsProviderMock.isReady = true;
  view.rerender(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_double_raf' })
    );
  });
  expect(prewarmWorkspaceSettingsOverlay).toHaveBeenCalledTimes(1);
});

it('waits for review scheduler settings before hidden-window app ready', async () => {
  setDocumentVisibility('hidden');
  const { App } = await import('./App');
  const view = render(<App />);

  expect(reportRuntimeAppReady).not.toHaveBeenCalled();

  reviewSettingsProviderMock.isReady = true;
  view.rerender(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_hidden_window' })
    );
  });
});
