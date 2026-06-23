import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const prewarmAppOverlayStack = vi.fn(() => Promise.resolve());
const prewarmImportSourceWorkspace = vi.fn(() => Promise.resolve());
const prewarmWorkspaceRightSidebarPanels = vi.fn(() => Promise.resolve());
const prewarmWorkspaceSettingsOverlay = vi.fn(() => Promise.resolve());
const reportRuntimeAppReady = vi.fn();
const reportRuntimeBootStage = vi.fn();
const useAppController = vi.fn();
const reviewSettingsProviderMock = vi.hoisted(() => ({ isReady: true }));
const demoRuntimeMock = vi.hoisted(() => ({ isDemo: false }));

let animationFrameCallbacks: FrameRequestCallback[] = [];
let idleCallbacks: IdleRequestCallback[] = [];

const originalWindowDescriptors = {
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame'),
  cancelIdleCallback: Object.getOwnPropertyDescriptor(window, 'cancelIdleCallback'),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame'),
  requestIdleCallback: Object.getOwnPropertyDescriptor(window, 'requestIdleCallback')
};

vi.mock('./AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock('./hooks/useAppController', () => ({ useAppController }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated }));
vi.mock('./components/AppOverlayStack', () => ({
  AppOverlayStack: () => null,
  prewarmAppOverlayStack
}));
vi.mock('./components/ImportSourceWorkspace', () => ({ prewarmImportSourceWorkspace }));
vi.mock('./components/WorkspaceSettingsOverlay', () => ({ prewarmWorkspaceSettingsOverlay }));
vi.mock('./components/WorkspaceLayoutWithReviewQueueDialog', () => ({
  WorkspaceLayoutWithReviewQueueDialog: () => <div>workspace-layout</div>
}));
vi.mock('./components/workspaceRightSidebarPanelLoaders', () => ({ prewarmWorkspaceRightSidebarPanels }));
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
  useReviewSchedulerSettings: () => ({ isReviewSchedulerSettingsReady: reviewSettingsProviderMock.isReady })
}));
vi.mock('../shared/diagnostics/workspaceDebugBridge', () => ({ installWorkspaceDebugBridge: () => undefined }));
vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({ readPerformanceDiagnosticsProbe: () => undefined }));
vi.mock('../shared/platform/runtime/demoRuntime', () => ({
  useDemoRuntimeState: () => ({ isDemo: demoRuntimeMock.isDemo })
}));
vi.mock('../shared/platform/runtimeBootTelemetry', () => ({
  reportRuntimeAppReady,
  reportRuntimeBootStage
}));

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

function setAppReadyControllerState() {
  useAppController.mockReturnValue({
    hotkeySettings: {},
    layoutProps: {
      imports: { onCloseImportManagement: vi.fn() },
      layoutChrome: { isWorkspaceHydrated: true },
      navigation: { onSelectNode: vi.fn() }
    }
  });
}

function installFrameAndIdleMocks() {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    })
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(window, 'requestIdleCallback', {
    configurable: true,
    value: vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    })
  });
  Object.defineProperty(window, 'cancelIdleCallback', {
    configurable: true,
    value: vi.fn()
  });
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

async function flushIdleQueue(count: number) {
  for (let index = 0; index < count; index += 1) {
    await waitFor(() => {
      expect(idleCallbacks.length).toBeGreaterThan(0);
    });
    act(() => flushNextIdleCallback());
  }
}

function flushAnimationFramesUntilAppReady() {
  for (let index = 0; index < 8 && reportRuntimeAppReady.mock.calls.length === 0; index += 1) {
    act(() => flushNextAnimationFrame());
    expect(prewarmAppOverlayStack).not.toHaveBeenCalled();
  }
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
  reviewSettingsProviderMock.isReady = true;
  demoRuntimeMock.isDemo = false;
  animationFrameCallbacks = [];
  idleCallbacks = [];
  document.body.dataset.bootSkeleton = '';
  setDocumentVisibility('visible');
  installFrameAndIdleMocks();
  setAppReadyControllerState();
});

afterEach(() => {
  restoreWindowDescriptor('cancelAnimationFrame');
  restoreWindowDescriptor('cancelIdleCallback');
  restoreWindowDescriptor('requestAnimationFrame');
  restoreWindowDescriptor('requestIdleCallback');
});

it('does not prewarm interactive surfaces before visible app ready is reported', async () => {
  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(reportRuntimeBootStage).toHaveBeenCalledWith('app_ready_signal_registration', {
      source: 'workspace_hydrated'
    });
  });
  expect(prewarmAppOverlayStack).not.toHaveBeenCalled();

  flushAnimationFramesUntilAppReady();
  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_double_raf' })
    );
  });
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
  expect(prewarmAppOverlayStack).not.toHaveBeenCalled();

  await flushIdleQueue(4);
  await waitFor(() => {
    expect(prewarmAppOverlayStack).toHaveBeenCalledTimes(1);
  });
  expect(prewarmWorkspaceSettingsOverlay).toHaveBeenCalledTimes(1);
  expect(prewarmWorkspaceRightSidebarPanels).toHaveBeenCalledTimes(1);
  expect(prewarmImportSourceWorkspace).toHaveBeenCalledTimes(1);
});

it('allows prewarm after hidden-window app ready is reported', async () => {
  setDocumentVisibility('hidden');
  const { App } = await import('./App');

  render(<App />);

  await waitFor(() => {
    expect(reportRuntimeAppReady).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'workspace_hydrated_hidden_window' })
    );
  });
  expect(document.body.dataset.bootSkeleton).toBe('hidden');
  expect(prewarmAppOverlayStack).not.toHaveBeenCalled();

  act(() => flushNextIdleCallback());
  await waitFor(() => {
    expect(prewarmAppOverlayStack).toHaveBeenCalledTimes(1);
  });
});
