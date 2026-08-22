import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';
import { setSystemEntryDisplayNames } from '../../../../shared/localization/systemEntryDisplayNamesStore';
import { resolveNodeDisplayTitle } from '../../../../shared/localization/systemEntryNames';
import type { ElectronAPI } from '../../../../shared/platform/electronApi';

import { SettingsSystemEntryNamesSection } from './SettingsSystemEntryNamesSection';

beforeEach(() => {
  delete window.electronAPI;
  window.localStorage.clear();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
});

it('commits a trimmed whole-map update and immediately changes every shared resolver consumer', async () => {
  const invoke = vi.fn(async (_command: string, args?: { payload?: unknown }) => args?.payload);
  window.electronAPI = { invoke } as unknown as ElectronAPI;
  renderSection();

  const input = screen.getByRole('textbox', { name: 'Custom name for Inbox' });
  fireEvent.change(input, { target: { value: '  Reading inbox  ' } });
  fireEvent.blur(input);

  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('save_system_entry_display_names', {
      payload: { customDisplayNameById: { inbox: 'Reading inbox' }, version: 1 }
    })
  );
  expect(resolveNodeDisplayTitle('zh-Hans', 'special-inbox', 'Legacy Inbox')).toBe('Reading inbox');
});

it('keeps the confirmed map when saving fails', async () => {
  setSystemEntryDisplayNames({ customDisplayNameById: { inbox: 'Confirmed inbox' }, version: 1 });
  window.electronAPI = {
    invoke: vi.fn((command: string) =>
      command === 'save_system_entry_display_names'
        ? Promise.reject(new Error('sqlite_write_failed'))
        : Promise.resolve(null)
    )
  } as unknown as ElectronAPI;
  renderSection();

  const input = screen.getByRole('textbox', { name: 'Custom name for Inbox' });
  fireEvent.change(input, { target: { value: 'Unconfirmed inbox' } });
  fireEvent.blur(input);

  await waitFor(() =>
    expect(
      screen.getByText('The name could not be saved. The last saved names are still in use.')
    ).toBeInTheDocument()
  );
  expect(input).toHaveValue('Confirmed inbox');
  expect(resolveNodeDisplayTitle('en', 'special-inbox', 'Legacy Inbox')).toBe('Confirmed inbox');
});

it('clears only one override and returns it to the current locale default', async () => {
  setSystemEntryDisplayNames({
    customDisplayNameById: { home: 'Start here', inbox: 'Reading inbox' },
    version: 1
  });
  const invoke = vi.fn(async (_command: string, args?: { payload?: unknown }) => args?.payload);
  window.electronAPI = { invoke } as unknown as ElectronAPI;
  renderSection();

  const inboxInput = screen.getByRole('textbox', { name: 'Custom name for Inbox' });
  const row = inboxInput.closest('[data-settings-row]');
  fireEvent.click(row!.querySelector('button')!);

  await waitFor(() => expect(inboxInput).toHaveValue(''));
  expect(resolveNodeDisplayTitle('zh-Hans', 'special-inbox', 'Legacy Inbox')).toBe('收件箱');
  expect(resolveNodeDisplayTitle('zh-Hans', 'special-home', 'Legacy Home')).toBe('Start here');
});

function renderSection() {
  return render(
    <LocalizationProvider>
      <SettingsSystemEntryNamesSection />
    </LocalizationProvider>
  );
}
