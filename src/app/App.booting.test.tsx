import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reportRuntimeBootStage = vi.fn();

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState
  });
}

vi.mock('./hooks/useAppController', () => ({
  useAppController
}));

vi.mock('../store/workspaceStoreHydration', () => ({
  ensureWorkspaceHydrated
}));

vi.mock('../shared/platform/runtimeBootTelemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/runtimeBootTelemetry')>()),
  reportRuntimeAppReady,
  reportRuntimeBootStage
}));

vi.mock('../features/settings/context/AppearanceSettingsProvider', () => ({
  AppearanceSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('../features/settings/context/MouseGestureSettingsProvider', () => ({
  MouseGestureSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('../features/settings/context/ReviewSchedulerSettingsProvider', () => ({
  ReviewSchedulerSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('../features/settings/context/HotkeySettingsProvider', () => ({
  HotkeySettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('./components/WorkspaceLayout', () => ({
  WorkspaceLayout: () => <div>workspace-layout</div>
}));

vi.mock('./components/CommandPalette', () => ({
  CommandPalette: () => null
}));

vi.mock('./components/SearchPalette', () => ({
  SearchPalette: () => null
}));

vi.mock('./components/GoToNodePalette', () => ({
  GoToNodePalette: () => null
}));

vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({
  readPerformanceDiagnosticsProbe: () => undefined
}));

vi.mock('../shared/testing/workspaceDebugBridge', () => ({
  installWorkspaceDebugBridge: () => undefined
}));

function createLayoutProps(isWorkspaceHydrated = false) {
  return {
    layoutChrome: { isWorkspaceHydrated },
    settings: {}
  };
}

beforeEach(() => {
  useAppController.mockReset();
  ensureWorkspaceHydrated.mockClear();
  reportRuntimeAppReady.mockClear();
  reportRuntimeBootStage.mockClear();
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
});

it('renders the workspace chrome immediately without a boot-only shell', async () => {
  useAppController.mockReturnValue({
    hotkeySettings: {},
    goToNodeState: {},
    moveToNodeState: {},
    layoutProps: createLayoutProps(),
    paletteState: {},
    searchState: {}
  });

  const { App } = await import('./App');

  render(<App />);

  expect(screen.getByText('workspace-layout')).toBeInTheDocument();
  expect(screen.queryByRole('status', { name: 'Loading workspace' })).not.toBeInTheDocument();
  expect(useAppController).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
  });
  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
});

it('reports app ready only after the hydrated workspace has painted', async () => {
  useAppController.mockReturnValue({
    hotkeySettings: {},
    goToNodeState: {},
    moveToNodeState: {},
    layoutProps: createLayoutProps(true),
    paletteState: {},
    searchState: {}
  });

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
  useAppController.mockReturnValue({
    hotkeySettings: {},
    goToNodeState: {},
    moveToNodeState: {},
    layoutProps: createLayoutProps(true),
    paletteState: {},
    searchState: {}
  });

  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_hidden_window' })
    );
  });
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
});
