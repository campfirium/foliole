import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import type { HotkeySettingItem } from '../model/hotkeySettings';

import { HotkeySettingsSection } from './HotkeySettingsSection';

const ITEMS: HotkeySettingItem[] = [
  {
    commandId: 'target.command',
    isCustomized: false,
    primaryShortcutLabel: 'Ctrl+1',
    secondaryShortcutLabel: '',
    section: 'Test',
    shortcutSummaryLabel: 'Ctrl+1',
    title: 'Shared Command'
  },
  {
    commandId: 'duplicate.command',
    isCustomized: false,
    primaryShortcutLabel: 'Ctrl+2',
    secondaryShortcutLabel: '',
    section: 'Test',
    shortcutSummaryLabel: 'Ctrl+2',
    title: 'Shared Command'
  },
  {
    commandId: 'another.command',
    isCustomized: false,
    primaryShortcutLabel: 'Ctrl+3',
    secondaryShortcutLabel: '',
    section: 'Test',
    shortcutSummaryLabel: 'Ctrl+3',
    title: 'Another Command'
  }
];

it('filters by requested command id, shows its title, focuses it, and releases manual search', async () => {
  const onRequestedCommandConsumed = vi.fn();
  renderWithLocalization(
    <HotkeySettingsSection
      items={ITEMS}
      onRequestedCommandConsumed={onRequestedCommandConsumed}
      onReset={vi.fn()}
      onResetAll={vi.fn()}
      onUpdate={() => ({ status: 'blocked' })}
      requestedCommandId="target.command"
    />
  );

  const search = screen.getByRole('searchbox', { name: 'Search hotkeys' });
  await waitFor(() => expect(search).toHaveValue('Shared Command'));
  expect(screen.getAllByText('Shared Command')).toHaveLength(1);
  const targetShortcut = screen.getByRole('button', { name: 'Shortcut for Shared Command' });
  expect(targetShortcut).toHaveTextContent('Ctrl+1');
  await waitFor(() => expect(targetShortcut).toHaveFocus());
  expect(screen.queryByText('Ctrl+2')).not.toBeInTheDocument();
  expect(onRequestedCommandConsumed).toHaveBeenCalledTimes(1);

  fireEvent.change(search, { target: { value: 'another' } });
  expect(screen.getByText('Another Command')).toBeInTheDocument();
  expect(screen.queryByText('Shared Command')).not.toBeInTheDocument();
});
