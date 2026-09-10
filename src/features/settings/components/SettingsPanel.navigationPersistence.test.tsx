import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { useHotkeySettings } from '../context/HotkeySettingsProvider';

import { SettingsPanel } from './SettingsPanel';
import { renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

function SettingsNavigationHarness() {
  const hotkeys = useHotkeySettings();
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          hotkeys.onConfigureShortcut('workspace.createFolder');
          setIsOpen(true);
        }}
        type="button"
      >
        Configure shortcut
      </button>
      <button onClick={() => setIsOpen(true)} type="button">
        Open settings
      </button>
      {isOpen ? <SettingsPanel onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('keeps directed shortcut navigation out of the remembered settings category', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory, 'about');
  renderWithMouseGestureProvider(<SettingsNavigationHarness />);

  fireEvent.click(screen.getByRole('button', { name: 'Configure shortcut' }));
  expect(await screen.findByRole('button', { name: 'Hotkeys', current: 'page' })).toBeInTheDocument();
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory)).toBe('about');

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Hotkeys', current: 'page' })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
  expect(await screen.findByRole('button', { name: 'About', current: 'page' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.settingsActiveCategory)).toBe('appearance');
});
