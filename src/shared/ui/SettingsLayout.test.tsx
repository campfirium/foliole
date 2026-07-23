import { render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { preloadTranslationCatalog } from '../localization/translations';

import {
  SettingsControlSlot,
  SettingsButton,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  settingsCompactButtonClassName,
  settingsCompactFieldClassName,
  settingsCompactUtilityIconButtonClassName,
  settingsIconGridButtonClassName,
  settingsPickerTrackClassName,
  settingsSelectableOptionClassName,
  settingsSidebarBadgeClassName,
  settingsSidebarItemClassName
} from './SettingsLayout';

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
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' }).closest('[data-settings-row]')?.className).toContain('min-h-settings-row');
  expect(screen.getByRole('heading', { level: 4, name: 'Primary shortcut' }).closest('[data-settings-row]')?.className).toContain('px-settings-panel-x');
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

it('keeps compact settings control helpers on shared token chrome', () => {
  expect(settingsCompactFieldClassName('w-20')).toContain('bg-settings-control');
  expect(settingsCompactFieldClassName()).toContain('focus-visible:ring-ring');
  expect(settingsCompactButtonClassName()).toContain('border-settings-control-border');
  expect(settingsCompactUtilityIconButtonClassName(true)).toContain('text-settings-icon-active');
  expect(settingsCompactUtilityIconButtonClassName(false)).toContain('hover:text-settings-icon-hover');
});

it('lets a loading settings button use its active label and inline spinner', () => {
  const { container } = render(<SettingsButton loading loadingLabel="Exporting…">Export</SettingsButton>);
  const button = screen.getByRole('button', { name: 'Exporting…' });

  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(button.className).toContain('gap-2');
  expect(button.className).toContain('disabled:opacity-100');
  expect(button).toHaveTextContent('Exporting…');
  expect(container.querySelector('.animate-spin.shrink-0')).not.toBeNull();
  expect(container.querySelector('.animate-spin.absolute')).toBeNull();
});

it('keeps settings selection helpers on shared token states', () => {
  expect(settingsSelectableOptionClassName(true)).toContain('bg-settings-selected');
  expect(settingsSelectableOptionClassName(false)).toContain('hover:bg-settings-selected');
  expect(settingsSidebarBadgeClassName()).toContain('border-settings-control-border');
  expect(settingsSidebarItemClassName(true)).toContain('bg-settings-selected');
  expect(settingsIconGridButtonClassName(false)).toContain('hover:bg-settings-control-hover');
  expect(settingsPickerTrackClassName('h-5')).toContain('rounded-md');
});
