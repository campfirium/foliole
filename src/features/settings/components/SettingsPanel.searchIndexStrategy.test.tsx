import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../../lib/core/database/fullTextSearchIndexStrategy';

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
          requestedCategory="external-search"
        />
      ) : null}
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('persists the full-text search index strategy from settings', async () => {
  renderWithMouseGestureProvider(<SearchSettingsHarness />);

  const strategySelect = await screen.findByLabelText('Search text strategy');
  expect(strategySelect).toHaveValue('word-based');

  fireEvent.change(strategySelect, {
    target: { value: 'cjk-trigram' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  });

  fireEvent.click(screen.getByLabelText('Settings'));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  expect(await screen.findByLabelText('Search text strategy')).toHaveValue('cjk-trigram');
});
