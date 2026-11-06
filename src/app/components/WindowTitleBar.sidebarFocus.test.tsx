import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WindowTitleBar } from './WindowTitleBar';

vi.mock('../../shared/platform/windowControls', () => ({
  isWindowControlsAvailable: () => false,
  onMainWindowResized: async () => () => {},
  queryMainWindowMaximized: async () => false
}));

it('keeps keyboard focus on the left toggle while closing and reopening the list', () => {
  function Harness() {
    const [collapsed, setCollapsed] = useState(false);
    return <WindowTitleBar activeRightPanelId="dev" centerTitle={null}
      isListCollapsed={collapsed} isRightSidebarCollapsed={false} isTrashViewOpen={false}
      listWidth={320} rightSidebarWidth={320} onOpenTrashView={() => {}}
      onSelectRightPanel={() => {}} onToggleRightSidebarVisibility={() => {}}
      onToggleListVisibility={() => setCollapsed(value => !value)} />;
  }
  renderWithLocalization(<Harness />);
  const toggle = screen.getByRole('button', { name: 'Toggle left panel' });
  toggle.focus();
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Toggle left panel' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle left panel' }));
  expect(screen.getByRole('button', { name: 'Toggle left panel' })).toHaveFocus();
});
