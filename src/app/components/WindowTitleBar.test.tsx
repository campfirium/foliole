import { fireEvent, screen, waitFor } from '@testing-library/react';
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

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WindowTitleBar } from './WindowTitleBar';

function renderTitleBar(overrides: Partial<ComponentProps<typeof WindowTitleBar>> = {}) {
  return renderWithLocalization(
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
      {...overrides}
    />
  );
}

function openMoreRightPanelsMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More right sidebar panels' }), { key: 'ArrowDown' });
}

function createDragTransfer() {
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    setData: () => undefined
  };
}

function getVisibleRightSidebarButtonLabels() {
  return Array.from(document.querySelectorAll('.window-titlebar-right-panel-actions > button[aria-label]')).map((node) =>
    node.getAttribute('aria-label')
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 830 });
  window.localStorage.clear();
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
  const content = container.querySelector('.window-titlebar-right-content');
  const toggleAction = container.querySelector('.window-titlebar-right-expanded-action');
  const anchor = container.querySelector('.window-titlebar-right-zone');
  const panelActions = container.querySelector('.window-titlebar-right-panel-actions');
  expect(shell).not.toBeNull();
  expect(content).not.toBeNull();
  expect(toggleAction).not.toBeNull();
  expect(anchor).not.toBeNull();
  expect(panelActions).not.toBeNull();
  if (!shell || !content || !toggleAction || !anchor || !panelActions) {
    throw new Error('right sidebar titlebar anchor should exist');
  }
  expect(shell.contains(content)).toBe(true);
  expect(content.contains(toggleAction)).toBe(true);
  expect(content.contains(anchor)).toBe(true);
  expect(shell.contains(toggleAction)).toBe(true);
  expect(shell.contains(anchor)).toBe(true);
  expect(anchor.contains(panelActions)).toBe(true);
}

describe('WindowTitleBar', () => {
  it('keeps expanded left titlebar chrome to the sidebar toggle only', () => {
    const { container } = renderTitleBar();

    const leftZone = container.querySelector('.window-titlebar-left-zone[data-collapsed="false"]');
    const toggle = screen.getByRole('button', { name: 'Toggle left panel' });

    expect(leftZone).not.toBeNull();
    if (!leftZone) {
      throw new Error('expanded left titlebar zone should exist');
    }
    expect(leftZone).toContainElement(toggle);
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current change timestamp')).not.toBeInTheDocument();
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

  it('renders the current title in the center slot with a full-title tooltip', () => {
    renderTitleBar({ centerTitle: 'YC 编写的 Vibe Coding 指南' });

    const title = screen.getByText('YC 编写的 Vibe Coding 指南');
    expect(title).toBeInTheDocument();
    expect(title).toHaveAttribute('title', 'YC 编写的 Vibe Coding 指南');
  });

  it('renders an external marker beside external document titles', () => {
    const { container } = renderTitleBar({ centerTitle: 'External topic title', centerTitleIcon: 'external' });

    expect(screen.getByText('External topic title')).toBeInTheDocument();
    expect(container.querySelector('.window-titlebar-center-title svg')).not.toBeNull();
  });

});

describe('WindowTitleBar view switches', () => {
  it('collapses left titlebar actions down to the toggle button only', () => {
    renderTitleBar({ isListCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle left panel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Virtual' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
  });

  it('does not render left-side view switches in the titlebar', () => {
    renderTitleBar();

    expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Virtual' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trash' })).toBeNull();
  });
});

describe('WindowTitleBar right sidebar anchor layout', () => {
  it('renders the expanded right sidebar toggle before the divider and the panel button inside the right zone', () => {
    const { container } = renderTitleBar({ isRightSidebarCollapsed: false, rightSidebarWidth: 340 });
    expectExpandedRightAnchorLayout(container);
    expect(screen.getByRole('button', { name: 'Flow panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outline panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Highlights panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scheduling panel' })).not.toBeInTheDocument();
  });

  it('uses the more menu as the visible active control for overflow panels', () => {
    renderTitleBar({ activeRightPanelId: 'dev' });

    expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows every right sidebar panel in the more menu with icons', () => {
    renderTitleBar({ activeRightPanelId: 'dev', rightSidebarWidth: 340 });

    openMoreRightPanelsMenu();

    const devMenuItem = screen.getByRole('menuitem', { name: /Scheduling/ });
    const reviewQueueMenuItem = screen.getByRole('menuitem', { name: /Flow/ });

    expect(devMenuItem.querySelector('svg')).not.toBeNull();
    expect(reviewQueueMenuItem.querySelector('svg')).not.toBeNull();
    expect(screen.getAllByText('Top')).toHaveLength(3);
  });
});

describe('WindowTitleBar right sidebar anchor sorting', () => {
  it('reorders visible panel buttons after drag sorting', () => {
    renderTitleBar({ activeRightPanelId: 'dev', rightSidebarWidth: 340 });

    const reviewButton = screen.getByRole('button', { name: 'Flow panel' });
    const outlineButton = screen.getByRole('button', { name: 'Outline panel' });
    const transfer = createDragTransfer();

    fireEvent.dragStart(outlineButton, { dataTransfer: transfer });
    fireEvent.dragOver(reviewButton, { dataTransfer: transfer });
    fireEvent.dragEnd(outlineButton, { dataTransfer: transfer });

    expect(getVisibleRightSidebarButtonLabels()).toEqual([
      'Outline panel',
      'Flow panel',
      'Highlights panel',
      'More right sidebar panels'
    ]);
  });

  it('reorders overflow menu items and updates the visible button row', () => {
    renderTitleBar({ activeRightPanelId: 'dev', rightSidebarWidth: 340 });

    openMoreRightPanelsMenu();

    const devMenuItem = screen.getByRole('menuitem', { name: /Scheduling/ });
    const outlineMenuItem = screen.getByRole('menuitem', { name: /Outline/ });
    const transfer = createDragTransfer();

    fireEvent.dragStart(devMenuItem, { dataTransfer: transfer });
    fireEvent.dragOver(outlineMenuItem, { dataTransfer: transfer });
    fireEvent.dragEnd(devMenuItem, { dataTransfer: transfer });

    expect(getVisibleRightSidebarButtonLabels()).toEqual([
      'Flow panel',
      'Scheduling panel',
      'Outline panel',
      'More right sidebar panels'
    ]);
  });

  it('keeps the window controls out of the titlebar grid flow', () => {
    const { container } = renderTitleBar({ isRightSidebarCollapsed: false });
    const controls = container.querySelector<HTMLElement>('.window-titlebar-controls');
    const titlebar = container.querySelector<HTMLElement>('.window-titlebar');

    expect(titlebar).not.toBeNull();
    expect(controls).not.toBeNull();
    if (!titlebar || !controls) {
      throw new Error('titlebar and controls should exist');
    }

    expect(controls).toBeInTheDocument();
    expect(titlebar).toContainElement(controls);
  });
});
