import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { WindowTitleBarRightSidebarAnchor } from './WindowTitleBarRightSidebarAnchor';

function getVisibleRightSidebarButtonLabels() {
  return Array.from(document.querySelectorAll('.window-titlebar-right-panel-actions > button[aria-label]')).map((node) =>
    node.getAttribute('aria-label')
  );
}

afterEach(() => {
  window.localStorage.clear();
});

it('keeps only the more menu visible when the right titlebar is below the sidebar minimum', () => {
  const { container } = render(
    <WindowTitleBarRightSidebarAnchor
      activeRightPanelId="outline"
      isRightSidebarCollapsed={false}
      onSelectRightPanel={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={240}
    />
  );

  expect(getVisibleRightSidebarButtonLabels()).toEqual([
    'More right sidebar panels'
  ]);
  expect(container.querySelector('.window-titlebar-right-zone')).toHaveStyle({ pointerEvents: 'none' });
  expect(screen.getByRole('button', { name: 'Toggle right sidebar' })).toHaveClass('pointer-events-auto');
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toHaveClass('pointer-events-auto');
});

it('shows the first panel button at the default right sidebar width', () => {
  render(
    <WindowTitleBarRightSidebarAnchor
      activeRightPanelId="outline"
      isRightSidebarCollapsed={false}
      onSelectRightPanel={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={250}
    />
  );

  expect(getVisibleRightSidebarButtonLabels()).toEqual([
    'Flow panel',
    'More right sidebar panels'
  ]);
});

it('adds panel buttons back when the right sidebar budget has room', () => {
  render(
    <WindowTitleBarRightSidebarAnchor
      activeRightPanelId="outline"
      isRightSidebarCollapsed={false}
      onSelectRightPanel={() => undefined}
      onToggleRightSidebarVisibility={() => undefined}
      rightSidebarWidth={340}
    />
  );

  expect(getVisibleRightSidebarButtonLabels()).toEqual([
    'Flow panel',
    'Outline panel',
    'Highlights panel',
    'More right sidebar panels'
  ]);
});
