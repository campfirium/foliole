import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const overlayMocks = vi.hoisted(() => ({
  CommandPalette: vi.fn(() => <div>command-palette</div>),
  GoToNodePalette: vi.fn(() => <div>go-to-node-palette</div>),
  SearchPalette: vi.fn(() => <div>search-palette</div>)
}));

vi.mock('./hooks/useAppController', () => ({ useAppController }));
vi.mock('../store/workspaceStoreHydration', () => ({ ensureWorkspaceHydrated: vi.fn() }));
vi.mock('./components/WorkspaceLayoutWithReviewQueueDialog', () => ({
  WorkspaceLayoutWithReviewQueueDialog: () => <div>workspace-layout</div>
}));
vi.mock('./components/WorkspaceSettingsOverlay', () => ({ prewarmWorkspaceSettingsOverlay: vi.fn() }));
vi.mock('./components/ImportSourceWorkspace', () => ({ prewarmImportSourceWorkspace: vi.fn() }));
vi.mock('./components/workspaceRightSidebarPanelLoaders', () => ({ prewarmWorkspaceRightSidebarPanels: vi.fn() }));
vi.mock('./components/AppOverlayStack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/AppOverlayStack')>()),
  prewarmAppOverlayStack: vi.fn()
}));
vi.mock('./components/CommandPalette', () => ({ CommandPalette: overlayMocks.CommandPalette }));
vi.mock('./components/SearchPalette', () => ({ SearchPalette: overlayMocks.SearchPalette }));
vi.mock('./components/GoToNodePalette', () => ({ GoToNodePalette: overlayMocks.GoToNodePalette }));
vi.mock('../shared/platform/runtimeBootTelemetry', () => ({
  reportRuntimeAppReady: vi.fn(),
  reportRuntimeBootStage: vi.fn()
}));
vi.mock('../shared/platform/runtime/demoRuntime', () => ({
  useDemoRuntimeState: () => ({ isDemo: false })
}));
vi.mock('../features/settings/context/AppearanceSettingsProvider', () => ({
  AppearanceSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../features/settings/context/MouseGestureSettingsProvider', () => ({
  MouseGestureSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../features/settings/context/ReviewSchedulerSettingsProvider', () => ({
  ReviewSchedulerSettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReviewSchedulerSettings: () => ({ isReviewSchedulerSettingsReady: true })
}));
vi.mock('../features/settings/context/HotkeySettingsProvider', () => ({
  HotkeySettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock('../shared/localization/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocalization: () => ({ t: (key: string) => key }),
  useTranslation: () => (key: string) => key
}));
vi.mock('../shared/platform/performanceDiagnosticsProbe', () => ({ readPerformanceDiagnosticsProbe: () => undefined }));
vi.mock('../shared/diagnostics/workspaceDebugBridge', () => ({ installWorkspaceDebugBridge: () => undefined }));

beforeEach(() => {
  useAppController.mockReset();
  overlayMocks.CommandPalette.mockClear();
  overlayMocks.GoToNodePalette.mockClear();
  overlayMocks.SearchPalette.mockClear();
});

it('loads lazy command overlays only after the command entry opens', async () => {
  useAppController.mockReturnValue({
    goToNodeState: { isOpen: false },
    hotkeySettings: {},
    layoutProps: { layoutChrome: { isWorkspaceHydrated: false }, settings: {} },
    moveToNodeState: { isOpen: false },
    paletteState: { isOpen: true },
    reviewSourceTopicDeleteDialog: { isOpen: false },
    searchState: { isOpen: false }
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
