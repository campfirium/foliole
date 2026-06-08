import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import { SettingsControlSlot, SettingsGroup, SettingsRow, SettingsSection } from './SettingsLayout';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

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
  expect(screen.getByRole('heading', { level: 3, name: 'Hotkeys' }).className).toContain('text-ui-lg');
  expect(screen.getByText('Shared settings layout.')).toBeInTheDocument();
  expect(screen.getByText('Shared settings layout.').className).toContain('text-ui-md');
  expect(screen.getByText('Shared settings layout.').className).toContain('text-muted-foreground');
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' }).className).toContain('text-ui-lg');
  expect(screen.getByText('Controls the main action.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset all' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' }).closest('.bg-settings-group')).not.toBeNull();
});

it('passes row DOM props through to the settings row element', () => {
  render(
    <SettingsRow
      data-testid="draggable-row"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', 'row')}
      title="Draggable row"
    />
  );

  expect(screen.getByTestId('draggable-row')).toHaveAttribute('draggable', 'true');
});
