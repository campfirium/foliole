import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { SettingsControlSlot, SettingsGroup, SettingsRow, SettingsSection } from './SettingsLayout';

it('renders settings pattern structure with shared copy and action slot', () => {
  render(
    <SettingsSection actions={<button type="button">Reset all</button>} description="Shared settings layout." title="Hotkeys">
      <SettingsGroup>
        <SettingsRow description="Controls the main action." title="Primary shortcut">
          <SettingsControlSlot>
            <button type="button">Save</button>
          </SettingsControlSlot>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );

  expect(screen.getByRole('heading', { level: 3, name: 'Hotkeys' })).toBeInTheDocument();
  expect(screen.getByText('Shared settings layout.')).toBeInTheDocument();
  expect(screen.getByText('Shared settings layout.').className).toContain('text-muted-foreground');
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' })).toBeInTheDocument();
  expect(screen.getByText('Controls the main action.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' }).closest('.bg-settings-group')).not.toBeNull();
});
