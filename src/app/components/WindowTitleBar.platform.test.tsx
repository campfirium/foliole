import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/runtime/demoRuntime', () => ({
  useDemoRuntimeState: () => ({ isDemo: false })
}));
vi.mock('../../shared/platform/windowChrome', () => ({
  usesNativeMacOSWindowControls: () => true
}));
vi.mock('../../shared/platform/windowControls', () => ({
  closeMainWindow: vi.fn(),
  isWindowControlsAvailable: () => true,
  minimizeMainWindow: vi.fn(),
  onMainWindowResized: vi.fn().mockResolvedValue(() => undefined),
  queryMainWindowMaximized: vi.fn().mockResolvedValue(false),
  toggleMainWindowMaximize: vi.fn()
}));

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WindowTitleBar } from './WindowTitleBar';

it('uses native traffic lights without changing renderer column geometry', () => {
  const { container } = renderWithLocalization(
    <WindowTitleBar
      activeRightPanelId="dev"
      centerTitle={null}
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      listWidth={320}
      onOpenTrashView={() => undefined}
      onSelectRightPanel={() => undefined}
      onToggleListVisibility={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={320}
    />
  );
  const titlebar = container.querySelector<HTMLElement>('.window-titlebar');

  expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(titlebar?.dataset.windowControls).toBe('native-macos');
  expect(titlebar?.style.getPropertyValue('--window-titlebar-controls-width')).toBe('0px');
  expect(titlebar?.style.getPropertyValue('--window-titlebar-left-width')).toBe(
    'calc(var(--workspace-rail-width) + 321px)'
  );
  expect(titlebar?.style.getPropertyValue('--window-titlebar-native-controls-inset')).toBe('');
  expect(container.querySelector('[data-workspace-titlebar-leading-surface]')).toBeNull();
});
