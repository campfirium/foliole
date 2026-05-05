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
      activeRightPanelId="dev"
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      listWidth={320}
      onOpenNotesView={() => undefined}
      onOpenTrashView={() => undefined}
      onSelectRightPanel={() => undefined}
      onToggleListVisibility={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={320}
      {...overrides}
    />
  );
}

beforeEach(() => {
  closeMainWindow.mockClear();
  isWindowControlsAvailable.mockReset();
  isWindowControlsAvailable.mockReturnValue(true);
  minimizeMainWindow.mockClear();
  queryMainWindowMaximized.mockClear();
  toggleMainWindowMaximize.mockClear();
  onMainWindowResized.mockClear();
});

function expectExpandedRightAnchorLayout(container: HTMLElement) {
  const shell = container.querySelector('.window-titlebar-right-anchor-shell');
  const toggleAction = container.querySelector('.window-titlebar-right-expanded-action');
  const anchor = container.querySelector('.window-titlebar-right-zone');
  const panelActions = container.querySelector('.window-titlebar-right-panel-actions');
  expect(shell).not.toBeNull();
  expect(toggleAction).not.toBeNull();
  expect(anchor).not.toBeNull();
  expect(panelActions).not.toBeNull();
  if (!shell || !toggleAction || !anchor || !panelActions) {
    throw new Error('right sidebar titlebar anchor should exist');
  }
  expect(shell.contains(toggleAction)).toBe(true);
  expect(shell.contains(anchor)).toBe(true);
  expect(anchor.contains(panelActions)).toBe(true);
}

describe('WindowTitleBar', () => {
  it('renders the change timestamp to the left of the right-side divider', () => {
    const { container } = renderTitleBar();

    const leftZone = container.querySelector('.window-titlebar-left-zone[data-collapsed="false"]');
    const actions = container.querySelector('.window-titlebar-leading-actions');
    const timestamp = screen.getByLabelText('Current change timestamp');

    expect(leftZone).not.toBeNull();
    expect(actions).not.toBeNull();
    if (!leftZone || !actions) {
      throw new Error('expanded left titlebar zone should exist');
    }
    expect(leftZone).toContainElement(timestamp);
    expect(timestamp.textContent).toMatch(/^\d{4}$/);
    expect(actions.compareDocumentPosition(timestamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.queryByRole('button', { name: 'Review queue panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dev panel' })).not.toBeInTheDocument();
  });

  it('collapses left titlebar actions down to the toggle button only', () => {
    renderTitleBar({ isListCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle left panel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
  });
});

describe('WindowTitleBar right sidebar anchor', () => {
  it('renders the expanded right sidebar toggle before the divider and the panel button inside the right zone', () => {
    const { container } = renderTitleBar({ isRightSidebarCollapsed: false });
    expectExpandedRightAnchorLayout(container);
    expect(screen.getByRole('button', { name: 'Review queue panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dev panel' })).toBeInTheDocument();
  });
});
