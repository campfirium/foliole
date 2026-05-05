import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useAppController = vi.fn();
const ensureWorkspaceHydrated = vi.fn(() => Promise.resolve());

vi.mock('./hooks/useAppController', () => ({
  useAppController
}));

vi.mock('../store/workspaceStore', () => ({
  ensureWorkspaceHydrated
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

beforeEach(() => {
  useAppController.mockReset();
  ensureWorkspaceHydrated.mockClear();
});

it('renders the workspace chrome immediately without a boot-only shell', async () => {
  useAppController.mockReturnValue({
    hotkeySettings: {},
    goToNodeState: {},
    moveToNodeState: {},
    layoutProps: {},
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
});
