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
      centerTitle={null}
      isListCollapsed={false}
      isRightSidebarCollapsed={false}
      isTrashViewOpen={false}
      isVirtualViewOpen={false}
      listWidth={320}
      onOpenNotesView={() => undefined}
      onOpenVirtualView={() => undefined}
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
  const divider = container.querySelector('.window-titlebar-right-divider');
  const content = container.querySelector('.window-titlebar-right-content');
  const toggleAction = container.querySelector('.window-titlebar-right-expanded-action');
  const anchor = container.querySelector('.window-titlebar-right-zone');
  const panelActions = container.querySelector('.window-titlebar-right-panel-actions');
  expect(shell).not.toBeNull();
  expect(divider).not.toBeNull();
  expect(content).not.toBeNull();
  expect(toggleAction).not.toBeNull();
  expect(anchor).not.toBeNull();
  expect(panelActions).not.toBeNull();
  if (!shell || !divider || !content || !toggleAction || !anchor || !panelActions) {
    throw new Error('right sidebar titlebar anchor should exist');
  }
  expect(shell.contains(divider)).toBe(true);
  expect(shell.contains(content)).toBe(true);
  expect(content.contains(toggleAction)).toBe(true);
  expect(content.contains(anchor)).toBe(true);
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

  it('renders the current title in the center slot with a full-title tooltip', () => {
    renderTitleBar({ centerTitle: 'YC 编写的 Vibe Coding 指南' });

    const title = screen.getByText('YC 编写的 Vibe Coding 指南');
    expect(title).toBeInTheDocument();
    expect(title).toHaveAttribute('title', 'YC 编写的 Vibe Coding 指南');
  });
});

describe('WindowTitleBar view switches', () => {
  it('renders right sidebar toggle beside window controls when sidebar is collapsed', () => {
    renderTitleBar({ isRightSidebarCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review queue panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Source info panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Highlights panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dev panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();
  });

  it('collapses left titlebar actions down to the toggle button only', () => {
    renderTitleBar({ isListCollapsed: true });

    expect(screen.getByRole('button', { name: 'Toggle left panel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Virtual Nodes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trash' })).not.toBeInTheDocument();
  });

  it('renders the virtual node switch between notes and trash', () => {
    renderTitleBar();

    const notesButton = screen.getByRole('button', { name: 'Notes' });
    const virtualButton = screen.getByRole('button', { name: 'Virtual Nodes' });
    const trashButton = screen.getByRole('button', { name: 'Trash' });

    expect(notesButton.compareDocumentPosition(virtualButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(virtualButton.compareDocumentPosition(trashButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('WindowTitleBar right sidebar anchor layout', () => {
  it('renders the expanded right sidebar toggle before the divider and the panel button inside the right zone', () => {
    const { container } = renderTitleBar({ isRightSidebarCollapsed: false });
    expectExpandedRightAnchorLayout(container);
    expect(screen.getByRole('button', { name: 'Review queue panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Source info panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Highlights panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dev panel' })).not.toBeInTheDocument();
  });

  it('uses the more menu as the visible active control for overflow panels', () => {
    renderTitleBar({ activeRightPanelId: 'dev' });

    expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveAttribute('data-active', 'true');
  });

  it('shows every right sidebar panel in the more menu with icons', () => {
    renderTitleBar({ activeRightPanelId: 'dev' });

    openMoreRightPanelsMenu();

    const devMenuItem = screen.getByRole('menuitem', { name: /Dev/ });
    const reviewQueueMenuItem = screen.getByRole('menuitem', { name: /Review queue/ });

    expect(devMenuItem.querySelector('svg')).not.toBeNull();
    expect(reviewQueueMenuItem.querySelector('svg')).not.toBeNull();
    expect(screen.getAllByText('Top')).toHaveLength(3);
  });
});

describe('WindowTitleBar right sidebar anchor sorting', () => {
  it('reorders visible panel buttons after drag sorting', () => {
    renderTitleBar({ activeRightPanelId: 'dev' });

    const reviewButton = screen.getByRole('button', { name: 'Review queue panel' });
    const highlightsButton = screen.getByRole('button', { name: 'Highlights panel' });
    const transfer = createDragTransfer();

    fireEvent.dragStart(highlightsButton, { dataTransfer: transfer });
    fireEvent.dragOver(reviewButton, { dataTransfer: transfer });
    fireEvent.dragEnd(highlightsButton, { dataTransfer: transfer });

    expect(getVisibleRightSidebarButtonLabels()).toEqual([
      'Highlights panel',
      'Review queue panel',
      'Source info panel',
      'More right sidebar panels'
    ]);
  });

  it('reorders overflow menu items and updates the visible button row', () => {
    renderTitleBar({ activeRightPanelId: 'dev' });

    openMoreRightPanelsMenu();

    const devMenuItem = screen.getByRole('menuitem', { name: /Dev/ });
    const sourceInfoMenuItem = screen.getByRole('menuitem', { name: /Source info/ });
    const transfer = createDragTransfer();

    fireEvent.dragStart(devMenuItem, { dataTransfer: transfer });
    fireEvent.dragOver(sourceInfoMenuItem, { dataTransfer: transfer });
    fireEvent.dragEnd(devMenuItem, { dataTransfer: transfer });

    expect(getVisibleRightSidebarButtonLabels()).toEqual([
      'Review queue panel',
      'Dev panel',
      'Source info panel',
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
