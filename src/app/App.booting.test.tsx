import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reportRuntimeBootStage = vi.fn();
const overlayMocks = vi.hoisted(() => ({
  CommandPalette: vi.fn(() => <div>command-palette</div>),
  GoToNodePalette: vi.fn(() => <div>go-to-node-palette</div>),
  SearchPalette: vi.fn(() => <div>search-palette</div>)
}));

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
  CommandPalette: overlayMocks.CommandPalette
}));

vi.mock('./components/SearchPalette', () => ({
  SearchPalette: overlayMocks.SearchPalette
}));

vi.mock('./components/GoToNodePalette', () => ({
  GoToNodePalette: overlayMocks.GoToNodePalette
}));

vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({
  readPerformanceDiagnosticsProbe: () => undefined
}));

vi.mock('../shared/diagnostics/workspaceDebugBridge', () => ({
  installWorkspaceDebugBridge: () => undefined
}));

function createLayoutProps(isWorkspaceHydrated = false) {
  return {
    layoutChrome: { isWorkspaceHydrated },
    settings: {}
  };
}

function createClosedOverlayState() {
  return {
    goToNodeState: { isOpen: false },
    moveToNodeState: { isOpen: false },
    paletteState: { isOpen: false },
    reviewSourceTopicDeleteDialog: { isOpen: false },
    searchState: { isOpen: false }
  };
}

beforeEach(() => {
  useAppController.mockReset();
  ensureWorkspaceHydrated.mockClear();
  reportRuntimeAppReady.mockClear();
  reportRuntimeBootStage.mockClear();
  overlayMocks.CommandPalette.mockClear();
  overlayMocks.GoToNodePalette.mockClear();
  overlayMocks.SearchPalette.mockClear();
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
});

it('shows the startup surface until the workspace runtime loads', async () => {
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps()
  });

  const { App } = await import('./App');

  render(<App />);

  expect(screen.getByRole('status')).toHaveTextContent('Starting Foliole');
  expect(await screen.findByText('workspace-layout', {}, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(useAppController).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
  });
  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
  expect(overlayMocks.CommandPalette).not.toHaveBeenCalled();
  expect(overlayMocks.GoToNodePalette).not.toHaveBeenCalled();
  expect(overlayMocks.SearchPalette).not.toHaveBeenCalled();
});

it('loads lazy command overlays only after the command entry opens', async () => {
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps(),
    paletteState: { isOpen: true }
  });

  const { App } = await import('./App');

  render(<App />);

  expect(await screen.findByText('workspace-layout', {}, { timeout: 5000 })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('command-palette')).toBeInTheDocument();
  });
  expect(overlayMocks.CommandPalette).toHaveBeenCalledTimes(1);
  expect(overlayMocks.GoToNodePalette).not.toHaveBeenCalled();
  expect(overlayMocks.SearchPalette).not.toHaveBeenCalled();
});

it('reports app ready only after the hydrated workspace has painted', async () => {
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps(true)
  });

  const { App } = await import('./App');

  render(<App />);

  await screen.findByText('workspace-layout', {}, { timeout: 5000 });
  await waitFor(
    () => {
      expect(reportRuntimeAppReady).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'workspace_hydrated_double_raf' })
      );
    },
    { timeout: 5000 }
  );
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
});

it('reports app ready without waiting for animation frames while the window is hidden', async () => {
  setDocumentVisibility('hidden');
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps(true)
  });

  const { App } = await import('./App');

  render(<App />);

  await screen.findByText('workspace-layout', {}, { timeout: 5000 });
  await waitFor(
    () => {
      expect(reportRuntimeAppReady).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'workspace_hydrated_hidden_window' })
      );
    },
    { timeout: 5000 }
  );
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
});
