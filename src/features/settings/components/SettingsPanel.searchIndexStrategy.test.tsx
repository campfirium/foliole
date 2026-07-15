import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../../lib/core/database/fullTextSearchIndexStrategy';
import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import type { RuntimeLoginItemSettingsState } from '../../../shared/platform/loginItemSettings';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

let loginItemSettingsState: RuntimeLoginItemSettingsState = {
  enabled: false,
  effective: false,
  status: 'disabled',
  supported: true
};

function SearchSettingsHarness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">
        Reopen settings
      </button>
      {isOpen ? (
        <SettingsPanel
          {...createProps()}
          onClose={() => setIsOpen(false)}
          requestedCategory="general"
        />
      ) : null}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  loginItemSettingsState = { enabled: false, effective: false, status: 'disabled', supported: true };
  const invoke = vi.fn(async (command: string) => {
    if (command === 'load_login_item_settings') {
      return loginItemSettingsState;
    }
    if (command === 'save_login_item_settings') {
      return { enabled: true, effective: true, status: 'enabled', supported: true };
    }
    if (command === 'load_search_index_rebuild_status') return null;
    if (command === 'save_app_settings_state') return null;
    if (command === 'rebuild_search_index') {
      return { status: 'rebuilding', strategy: 'cjk-trigram' };
    }
    return null;
  }) as unknown as NativeInvoke;
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSearchIndexRebuildStatus: () => () => undefined,
    onWindowResized: () => () => undefined
  };
});

it('persists full-text search language from General settings', async () => {
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  const select = await screen.findByRole('combobox', { name: 'Full-text search language' });
  expect(select).toHaveValue('word-based');
  expect(screen.getByText('Adjust general workspace behavior.')).toBeInTheDocument();
  expect(screen.getByText(/Chinese, Japanese, or Korean uses more search data/)).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Languages with word spacing' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Chinese, Japanese, or Korean' })).toBeInTheDocument();
  expect(screen.queryByText('Full-text search index')).not.toBeInTheDocument();

  fireEvent.change(select, { target: { value: 'cjk-trigram' } });

  await waitFor(() => {
    expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  });

  fireEvent.click(screen.getByLabelText('Settings'));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  expect(await screen.findByRole('combobox', { name: 'Full-text search language' })).toHaveValue('cjk-trigram');
});

it('toggles launch at startup from the General System settings', async () => {
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  const toggle = await screen.findByRole('switch', { name: 'Start Foliole automatically' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByText('Keep local sync and global clip available after startup.')).toBeInTheDocument();

  fireEvent.click(toggle);

  await waitFor(() => {
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

it('marks launch at startup unavailable when the runtime cannot manage it', async () => {
  loginItemSettingsState = { enabled: false, effective: false, status: 'unsupported', supported: false };
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  const electronAPI = window.electronAPI;
  expect(electronAPI).toBeDefined();
  await waitFor(() => expect(electronAPI!.invoke).toHaveBeenCalledWith('load_login_item_settings'));

  const toggle = screen.getByRole('switch', { name: 'Start Foliole automatically' });
  expect(toggle).toBeDisabled();
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
  expect(screen.getByText('Automatic startup is unavailable in this build.')).toBeInTheDocument();
});

it('explains when macOS requires login item approval', async () => {
  loginItemSettingsState = { enabled: true, effective: false, status: 'requires-approval', supported: true };
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  expect(await screen.findByText('Allow Foliole in System Settings > General > Login Items.')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Start Foliole automatically' })).toHaveAttribute('aria-checked', 'true');
});

it('reports a missing macOS login item as an error instead of disabled', async () => {
  loginItemSettingsState = { enabled: false, effective: false, status: 'error', supported: true };
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  expect(await screen.findByText('macOS could not find this login item. Try turning it on again.')).toBeInTheDocument();
});
