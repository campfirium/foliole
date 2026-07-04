import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());
const useAppController = vi.fn();

let scheduledTimeout: (() => void) | null = null;

const originalWindowDescriptors = {
  cancelAnimationFrame: Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame'),
  clearTimeout: Object.getOwnPropertyDescriptor(window, 'clearTimeout'),
  requestAnimationFrame: Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame'),
  setTimeout: Object.getOwnPropertyDescriptor(window, 'setTimeout')
};

vi.mock('./hooks/useAppController', () => ({ useAppController }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated }));
vi.mock('./AppProviders', () => ({ AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
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
  reportRuntimeAppReady: vi.fn(),
  reportRuntimeBootStage: vi.fn()
}));

function restoreWindowDescriptor(name: keyof typeof originalWindowDescriptors) {
  const descriptor = originalWindowDescriptors[name];
  if (descriptor) {
    Object.defineProperty(window, name, descriptor);
    return;
  }
  Reflect.deleteProperty(window, name);
}

beforeEach(() => {
  scheduledTimeout = null;
  ensureWorkspaceHydrated.mockClear();
  useAppController.mockReturnValue({
    hotkeySettings: {},
    layoutProps: {
      imports: { onCloseImportManagement: vi.fn() },
      layoutChrome: { isWorkspaceHydrated: false },
      navigation: { onSelectNode: vi.fn() }
    }
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: vi.fn(() => 1)
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(window, 'setTimeout', {
    configurable: true,
    value: vi.fn((callback: () => void) => {
      scheduledTimeout = callback;
      return 1;
    })
  });
  Object.defineProperty(window, 'clearTimeout', {
    configurable: true,
    value: vi.fn()
  });
});

afterEach(() => {
  restoreWindowDescriptor('cancelAnimationFrame');
  restoreWindowDescriptor('clearTimeout');
  restoreWindowDescriptor('requestAnimationFrame');
  restoreWindowDescriptor('setTimeout');
});

it('falls back to timeout hydration when animation frames are delayed', async () => {
  const { App } = await import('./App');

  render(<App />);
  await act(async () => {
    scheduledTimeout?.();
  });

  expect(ensureWorkspaceHydrated).toHaveBeenCalledTimes(1);
});
