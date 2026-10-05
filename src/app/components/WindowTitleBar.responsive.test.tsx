import { fireEvent, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../shared/platform/windowControls', () => ({
  closeMainWindow: vi.fn(),
  isWindowControlsAvailable: () => true,
  minimizeMainWindow: vi.fn(),
  onMainWindowResized: vi.fn(async () => undefined),
  queryMainWindowMaximized: vi.fn(async () => false),
  toggleMainWindowMaximize: vi.fn()
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

function getVisibleRightSidebarButtonLabels() {
  return Array.from(document.querySelectorAll('.window-titlebar-right-panel-actions > button[aria-label]')).map((node) =>
    node.getAttribute('aria-label')
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

it('retains the right sidebar toggle in compact windows', () => {
  const onToggleRightSidebarVisibility = vi.fn();
  renderTitleBar({ isRightSidebarCollapsed: true, onToggleRightSidebarVisibility });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle right sidebar' }));
  expect(onToggleRightSidebarVisibility).toHaveBeenCalledOnce();
});

it('keeps right titlebar width anchored to the right sidebar width when the titlebar has spare space', () => {
  const { container } = renderTitleBar({ isRightSidebarCollapsed: false, rightSidebarWidth: 320 });
  const titlebar = container.querySelector<HTMLElement>('.window-titlebar');

  expect(titlebar?.style.getPropertyValue('--window-titlebar-right-width')).toBe('320px');
  expect(getVisibleRightSidebarButtonLabels()).toEqual([
    'Flow panel',
    'Outline panel',
    'Highlights panel',
    'More right sidebar panels'
  ]);
});

it('shows all common right sidebar panels when the right sidebar titlebar itself has room', () => {
  renderTitleBar({ isRightSidebarCollapsed: false, rightSidebarWidth: 377 });

  expect(getVisibleRightSidebarButtonLabels()).toEqual([
    'Flow panel',
    'Outline panel',
    'Highlights panel',
    'Backlinks panel',
    'Foliole Aide panel',
    'Scheduling panel'
  ]);
  expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();
});

it('keeps the right sidebar restore toggle when the sidebar is manually collapsed', () => {
  renderTitleBar({ isRightSidebarCollapsed: true });

  expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Flow panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Highlights panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Scheduling panel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More right sidebar panels' })).not.toBeInTheDocument();
});
