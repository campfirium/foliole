import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SettingsControlSlot, SettingsRow, SettingsSection } from './SettingsLayout';

it('renders settings pattern structure with shared copy and action slot', () => {
  render(
    <SettingsSection actions={<button type="button">Reset all</button>} description="Shared settings layout." title="Hotkeys">
      <SettingsRow description="Controls the main action." title="Primary shortcut">
        <SettingsControlSlot>
          <button type="button">Save</button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );

  expect(screen.getByRole('heading', { level: 3, name: 'Hotkeys' })).toBeInTheDocument();
  expect(screen.getByText('Shared settings layout.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' })).toBeInTheDocument();
  expect(screen.getByText('Controls the main action.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});
