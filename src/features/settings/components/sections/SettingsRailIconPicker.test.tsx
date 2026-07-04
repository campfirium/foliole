import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';
import type { HotkeySettingItem } from '../../model/hotkeySettings';

import { IconPicker } from './SettingsRailIconPicker';

const action: HotkeySettingItem = {
  commandId: 'workspace.search',
  isCustomized: false,
  primaryShortcutLabel: '',
  secondaryShortcutLabel: '',
  shortcutSummaryLabel: '',
  title: 'Search'
};

function IconPickerHarness() {
  const [query, setQuery] = useState('discuss');
  return (
    <LocalizationProvider initialLanguagePreference="en">
      <IconPicker
        onBack={vi.fn()}
        onQueryChange={setQuery}
        onSelect={vi.fn()}
        query={query}
        selectedAction={action}
        selectedIconId="Search"
      />
    </LocalizationProvider>
  );
}

it('filters action bar icons by Lucide keyword search terms', () => {
  render(<IconPickerHarness />);

  expect(screen.getByLabelText('Search icons')).toHaveValue('discuss');
  expect(screen.getByRole('button', { name: 'Use Messages Square icon' })).toBeInTheDocument();
});
