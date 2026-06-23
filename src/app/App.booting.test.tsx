import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const prewarmAppOverlayStack = vi.fn(() => Promise.resolve());
const prewarmImportSourceWorkspace = vi.fn(() => Promise.resolve());
const prewarmWorkspaceRightSidebarPanels = vi.fn(() => Promise.resolve());
const prewarmWorkspaceSettingsOverlay = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reportRuntimeBootStage = vi.fn();
const demoRuntimeMock = vi.hoisted(() => ({
  isDemo: false
}));
const reviewSettingsProviderMock = vi.hoisted(() => ({
  isReady: true
}));
const originalWindowDescriptors = {
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame'),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame')
};

function setDocumentVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState
  });
}

function restoreWindowDescriptor(name: keyof typeof originalWindowDescriptors) {
  const descriptor = originalWindowDescriptors[name];
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
    return;
  }
  Reflect.deleteProperty(window, name);
}

function installAnimationFrameMock() {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    })
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn()
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

vi.mock('./components/AppOverlayStack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/AppOverlayStack')>()),
  prewarmAppOverlayStack
}));

vi.mock('./components/ImportSourceWorkspace', () => ({
  prewarmImportSourceWorkspace
}));

vi.mock('./components/workspaceRightSidebarPanelLoaders', () => ({
  prewarmWorkspaceRightSidebarPanels
}));

vi.mock('../shared/platform/runtimeBootTelemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/platform/runtimeBootTelemetry')>()),
  reportRuntimeAppReady,
  reportRuntimeBootStage
}));

vi.mock('../shared/platform/runtime/demoRuntime', () => ({
  useDemoRuntimeState: () => ({ isDemo: demoRuntimeMock.isDemo })
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

vi.mock('./components/WorkspaceLayout', () => ({
  WorkspaceLayout: () => <div>workspace-layout</div>
}));

vi.mock('./components/WorkspaceLayoutWithReviewQueueDialog', () => ({
  WorkspaceLayoutWithReviewQueueDialog: () => <div>workspace-layout</div>
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
  prewarmAppOverlayStack.mockClear();
  prewarmImportSourceWorkspace.mockClear();
  prewarmWorkspaceRightSidebarPanels.mockClear();
  prewarmWorkspaceSettingsOverlay.mockClear();
  reportRuntimeAppReady.mockClear();
  reportRuntimeBootStage.mockClear();
  demoRuntimeMock.isDemo = false;
  reviewSettingsProviderMock.isReady = true;
  document.body.dataset.bootSkeleton = '';
  Reflect.deleteProperty(window, 'requestIdleCallback');
  Reflect.deleteProperty(window, 'cancelIdleCallback');
  installAnimationFrameMock();
  setDocumentVisibility('visible');
});

afterEach(() => {
  restoreWindowDescriptor('cancelAnimationFrame');
  restoreWindowDescriptor('requestAnimationFrame');
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
}, 15000);

it('prewarms interactive surfaces after the hydrated workspace is ready', async () => {
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
  expect(prewarmAppOverlayStack).toHaveBeenCalledTimes(1);
  expect(prewarmWorkspaceRightSidebarPanels).toHaveBeenCalledTimes(1);
  expect(prewarmImportSourceWorkspace).toHaveBeenCalledTimes(1);
  expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2500 });
}, 15000);

it('skips settings overlay prewarm in the Demo runtime', async () => {
  demoRuntimeMock.isDemo = true;
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
    expect(prewarmImportSourceWorkspace).toHaveBeenCalledTimes(1);
  });
  expect(prewarmAppOverlayStack).toHaveBeenCalledTimes(1);
  expect(prewarmWorkspaceRightSidebarPanels).toHaveBeenCalledTimes(1);
  expect(prewarmWorkspaceSettingsOverlay).not.toHaveBeenCalled();
}, 15000);
