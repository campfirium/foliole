import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../lib/core/database/fullTextSearchIndexStrategy';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';

import { SearchPaletteEnhancementPrompt } from './SearchPaletteEnhancementPrompt';

beforeEach(() => {
  window.localStorage.clear();
  const invoke = vi.fn(async (command: string) => {
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
  vi.clearAllMocks();
});

it('offers search enhancement once and turns it on', async () => {
  const view = render(<SearchPaletteEnhancementPrompt />);

  expect(screen.getByRole('dialog', {
    name: 'Turn on search enhancement for languages without spaces?'
  })).toBeInTheDocument();
  expect(screen.getByText(/other languages that are not separated by spaces/)).toBeInTheDocument();
  expect(screen.getByText(/uses more search index storage/i)).toBeInTheDocument();
  expect(screen.getByText(/Settings > General/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

  await waitFor(() => {
    expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Search enhancement is on' })).toBeInTheDocument();
  });
  expect(screen.getByText('Preparing enhanced search...')).toBeInTheDocument();

  view.unmount();
  render(<SearchPaletteEnhancementPrompt />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('dismisses the search enhancement prompt without turning it on', () => {
  render(<SearchPaletteEnhancementPrompt />);

  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('does not prompt when search enhancement is already on and records the prompt as handled', async () => {
  window.localStorage.setItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY, 'cjk-trigram');

  render(<SearchPaletteEnhancementPrompt />);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  });
});

it('keeps the search enhancement prompt visible when local settings cannot be written', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('storage unavailable');
  });
  render(<SearchPaletteEnhancementPrompt />);

  fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

  expect(await screen.findByText('Search enhancement could not be turned on.')).toBeInTheDocument();
  expect(screen.getByRole('dialog', {
    name: 'Turn on search enhancement for languages without spaces?'
  })).toBeInTheDocument();
  setItem.mockRestore();
});
