import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../../lib/core/database/fullTextSearchIndexStrategy';
import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

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
          requestedCategory="about"
        />
      ) : null}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  const invoke = vi.fn(async (command: string) => {
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

it('persists search enhancement from General settings', async () => {
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  const toggle = await screen.findByRole('switch', { name: 'Search enhancement' });
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText('Adjust search behavior and view support tools.')).toBeInTheDocument();
  expect(screen.getByText(/other languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.queryByText('Full-text search index')).not.toBeInTheDocument();

  fireEvent.click(toggle);

  await waitFor(() => {
    expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  });

  fireEvent.click(screen.getByLabelText('Settings'));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  expect(await screen.findByRole('switch', { name: 'Search enhancement' })).toHaveAttribute('aria-checked', 'true');
});
