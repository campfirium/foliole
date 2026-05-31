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

it('keeps the more menu visible and drops panel buttons when the right titlebar is narrow', () => {
  render(
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
  expect(screen.getByRole('button', { name: 'More right sidebar panels' })).toBeInTheDocument();
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
