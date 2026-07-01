import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const prewarmAppOverlayStack = vi.fn(() => Promise.resolve());
const prewarmImportSourceWorkspace = vi.fn(() => Promise.resolve());
const prewarmWorkspaceRightSidebarPanels = vi.fn(() => Promise.resolve());
const prewarmWorkspaceSettingsOverlay = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reviewSettingsProviderMock = vi.hoisted(() => ({ isReady: false }));
const originalWindowDescriptors = {
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame'),
  cancelIdleCallback: Object.getOwnPropertyDescriptor(window, 'cancelIdleCallback'),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame'),
  requestIdleCallback: Object.getOwnPropertyDescriptor(window, 'requestIdleCallback')
};

let animationFrameCallbacks: FrameRequestCallback[] = [];
let idleCallbacks: IdleRequestCallback[] = [];

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

function restoreWindowDescriptor(name: keyof typeof originalWindowDescriptors) {
  const descriptor = originalWindowDescriptors[name];
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
    return;
  }
  Reflect.deleteProperty(window, name);
}

function installFrameAndIdleMocks() {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    })
  });
  Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: vi.fn() });
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    value: vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    })
  });
  Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: vi.fn() });
}

function flushNextAnimationFrame() {
  const callback = animationFrameCallbacks.shift();
  if (callback) {
    callback(performance.now());
  }
}

function flushNextIdleCallback() {
  const callback = idleCallbacks.shift();
  if (callback) {
    callback({ didTimeout: false, timeRemaining: () => 20 });
  }
}

async function flushNextScheduledIdleCallback() {
  await waitFor(() => {
    expect(idleCallbacks.length).toBeGreaterThan(0);
  });
  act(() => flushNextIdleCallback());
}

async function flushIdleQueueUntilSettingsPrewarmed() {
  for (let index = 0; index < 4 && prewarmWorkspaceSettingsOverlay.mock.calls.length === 0; index += 1) {
    await flushNextScheduledIdleCallback();
  }
}

async function flushAnimationFramesUntilAppReady() {
  for (let index = 0; index < 8 && reportRuntimeAppReady.mock.calls.length === 0; index += 1) {
    await waitFor(() => {
      expect(animationFrameCallbacks.length).toBeGreaterThan(0);
    });
    act(() => flushNextAnimationFrame());
  }
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
  animationFrameCallbacks = [];
  idleCallbacks = [];
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
  installFrameAndIdleMocks();
});

afterEach(() => {
  restoreWindowDescriptor('cancelAnimationFrame');
  restoreWindowDescriptor('cancelIdleCallback');
  restoreWindowDescriptor('requestAnimationFrame');
  restoreWindowDescriptor('requestIdleCallback');
});

it('waits for review scheduler settings before reporting app ready or prewarming', async () => {
  const { App } = await import('./App');
  const view = render(<App />);

  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
  expect(prewarmWorkspaceSettingsOverlay).not.toHaveBeenCalled();

  reviewSettingsProviderMock.isReady = true;
  view.rerender(<App />);

  await flushAnimationFramesUntilAppReady();
  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_double_raf' })
    );
  });
  await flushIdleQueueUntilSettingsPrewarmed();
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
