import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const closeMainWindow = vi.fn().mockResolvedValue(undefined);
const isWindowControlsAvailable = vi.fn(() => true);
const minimizeMainWindow = vi.fn().mockResolvedValue(undefined);
const queryMainWindowMaximized = vi.fn().mockResolvedValue(false);
const toggleMainWindowMaximize = vi.fn().mockResolvedValue(undefined);
const onMainWindowResized = vi.fn().mockResolvedValue(() => undefined);

vi.mock('../../shared/platform/windowControls', () => ({
  closeMainWindow: () => closeMainWindow(),
  isWindowControlsAvailable: () => isWindowControlsAvailable(),
  minimizeMainWindow: () => minimizeMainWindow(),
  onMainWindowResized: (handler: () => void) => onMainWindowResized(handler),
  queryMainWindowMaximized: () => queryMainWindowMaximized(),
  toggleMainWindowMaximize: () => toggleMainWindowMaximize()
}));

import { WindowTitleBar } from './WindowTitleBar';

function renderTitleBar(overrides: Partial<ComponentProps<typeof WindowTitleBar>> = {}) {
  return render(
    <WindowTitleBar
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      listWidth={320}
      onOpenNotesView={() => undefined}
      onOpenTrashView={() => undefined}
      onToggleListVisibility={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={320}
      {...overrides}
    />
  );
}

describe('WindowTitleBar', () => {
  beforeEach(() => {
    closeMainWindow.mockClear();
    isWindowControlsAvailable.mockReset();
    isWindowControlsAvailable.mockReturnValue(true);
    minimizeMainWindow.mockClear();
    queryMainWindowMaximized.mockClear();
    toggleMainWindowMaximize.mockClear();
    onMainWindowResized.mockClear();
  });

  it('triggers desktop window controls from titlebar buttons', () => {
    const { container } = renderTitleBar();

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const dragFill = container.querySelector('.window-titlebar-drag-fill');
    if (!dragFill) {
      throw new Error('window-titlebar-drag-fill should exist');
    }
    fireEvent.doubleClick(dragFill);

    expect(minimizeMainWindow).toHaveBeenCalledTimes(1);
    expect(toggleMainWindowMaximize).toHaveBeenCalledTimes(2);
    expect(closeMainWindow).toHaveBeenCalledTimes(1);
  });

  it('enables titlebar controls after desktop bridge becomes available post-mount', async () => {
    isWindowControlsAvailable.mockReturnValue(false);

    renderTitleBar({ isRightSidebarCollapsed: true });

    expect(screen.getByRole('button', { name: 'Minimize' })).toBeDisabled();

    window.setTimeout(() => {
      isWindowControlsAvailable.mockReturnValue(true);
    }, 0);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Minimize' })).toBeEnabled();
    }, { timeout: 1_000 });
  });

  it('renders right sidebar toggle beside window controls when sidebar is collapsed', () => {
    renderTitleBar({ isRightSidebarCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeInTheDocument();
  });

  it('collapses left titlebar actions down to the toggle button only', () => {
    renderTitleBar({ isListCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle left panel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
  });

  it('renders the expanded right sidebar toggle before the titlebar divider anchor', () => {
    const { container } = renderTitleBar({ isRightSidebarCollapsed: false });

    const shell = container.querySelector('.window-titlebar-right-anchor-shell');
    const action = container.querySelector('.window-titlebar-right-expanded-action');
    const anchor = container.querySelector('.window-titlebar-right-zone');
    expect(shell).not.toBeNull();
    expect(action).not.toBeNull();
    expect(anchor).not.toBeNull();
    if (!shell || !action || !anchor) {
      throw new Error('right sidebar titlebar anchor should exist');
    }
    expect(shell.contains(action)).toBe(true);
    expect(shell.contains(anchor)).toBe(true);
  });
});
