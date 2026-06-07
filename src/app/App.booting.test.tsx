import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const prewarmWorkspaceSettingsOverlay = vi.fn(() => Promise.resolve());
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

vi.mock('./components/WorkspaceSettingsOverlay', () => ({
  prewarmWorkspaceSettingsOverlay
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

vi.mock('../shared/localization/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocalization: () => ({ t: (key: string) => key }),
  useTranslation: () => (key: string) => key
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
  prewarmWorkspaceSettingsOverlay.mockClear();
  reportRuntimeAppReady.mockClear();
  reportRuntimeBootStage.mockClear();
  overlayMocks.CommandPalette.mockClear();
  overlayMocks.GoToNodePalette.mockClear();
  overlayMocks.SearchPalette.mockClear();
  document.body.dataset.bootSkeleton = '';
  Reflect.deleteProperty(window, 'requestIdleCallback');
  Reflect.deleteProperty(window, 'cancelIdleCallback');
  setDocumentVisibility('visible');
});

it('renders the workspace chrome immediately without a boot-only shell', async () => {
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps()
  });

  const { App } = await import('./App');

  render(<App />);

  expect(await screen.findByText('workspace-layout')).toBeInTheDocument();
  expect(screen.queryByText('Preparing workspace')).not.toBeInTheDocument();
  expect(useAppController).toHaveBeenCalledTimes(1);
  await waitFor(() => {
    expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
  });
  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
  expect(prewarmWorkspaceSettingsOverlay).not.toHaveBeenCalled();
  expect(overlayMocks.CommandPalette).not.toHaveBeenCalled();
  expect(overlayMocks.GoToNodePalette).not.toHaveBeenCalled();
  expect(overlayMocks.SearchPalette).not.toHaveBeenCalled();
});

it('prewarms settings after the hydrated workspace is ready', async () => {
  const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 20 });
    return 1;
  });
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    value: requestIdleCallback
  });
  Object.defineProperty(window, 'cancelIdleCallback', {
    configurable: true,
    value: vi.fn()
  });
  useAppController.mockReturnValue({
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps(true)
  });

  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(prewarmWorkspaceSettingsOverlay).toHaveBeenCalledTimes(1);
  });
  expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2500 });
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

  expect(screen.getByText('workspace-layout')).toBeInTheDocument();
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
    ...createClosedOverlayState(),
    hotkeySettings: {},
    layoutProps: createLayoutProps(true)
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
