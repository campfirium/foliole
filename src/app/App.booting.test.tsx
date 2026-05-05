import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const useWorkspaceHydration = vi.fn();
const useAppController = vi.fn();

vi.mock('./hooks/useWorkspaceHydration', () => ({
  useWorkspaceHydration
}));

vi.mock('./hooks/useAppController', () => ({
  useAppController
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
  useWorkspaceHydration.mockReset();
  useAppController.mockReset();
});

it('keeps the booting shell visible until workspace hydration finishes', async () => {
  useWorkspaceHydration.mockReturnValue(false);

  const { App } = await import('./App');

  render(<App />);

  expect(screen.getByRole('status', { name: 'Loading workspace' })).toBeInTheDocument();
  expect(screen.queryByText('Foliole is booting...')).not.toBeInTheDocument();
  expect(useAppController).not.toHaveBeenCalled();
});

it('renders the workspace after hydration completes', async () => {
  useWorkspaceHydration.mockReturnValue(true);
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
  expect(useAppController).toHaveBeenCalledTimes(1);
});
