import { beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../lib/core/database/fullTextSearchIndexStrategy';
import type { NativeInvoke } from '../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  getFullTextSearchIndexStrategy,
  dismissSearchEnhancementPrompt,
  dismissSearchEnhancementPromptIfEnabled,
  isSearchEnhancementEnabled,
  isSearchEnhancementPromptDismissed,
  setFullTextSearchIndexStrategy,
  setSearchEnhancementEnabled,
  shouldShowSearchEnhancementPrompt,
  updateFullTextSearchIndexStrategy,
  updateSearchEnhancementEnabled
} from './searchEnhancementSettings';
import { getLocalStorageWhitelist } from './storage';

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
});

it('stores the selected full-text search language strategy', () => {
  expect(getFullTextSearchIndexStrategy()).toBe('word-based');

  setFullTextSearchIndexStrategy('cjk-trigram');

  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  expect(getFullTextSearchIndexStrategy()).toBe('cjk-trigram');

  setFullTextSearchIndexStrategy('word-based');

  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('word-based');
});

it('keeps the old search enhancement API as a strategy compatibility layer', () => {
  expect(isSearchEnhancementEnabled()).toBe(false);

  setSearchEnhancementEnabled(true);

  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  expect(isSearchEnhancementEnabled()).toBe(true);
});

it('keeps the one-time prompt as a whitelisted runtime-mirrored local setting', () => {
  expect(getLocalStorageWhitelist()).toContain(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed);
  expect(isSearchEnhancementPromptDismissed()).toBe(false);
  expect(shouldShowSearchEnhancementPrompt()).toBe(true);

  dismissSearchEnhancementPrompt();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  expect(shouldShowSearchEnhancementPrompt()).toBe(false);
});

it('marks the prompt handled once search enhancement is already enabled', () => {
  setSearchEnhancementEnabled(true);

  dismissSearchEnhancementPromptIfEnabled();

  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed)).toBe('true');
  expect(shouldShowSearchEnhancementPrompt()).toBe(false);
});

it('saves full-text search language before requesting a live rebuild', async () => {
  const invokeMock = vi.fn(async (command: string) => {
    if (command === 'save_app_settings_state') return null;
    if (command === 'rebuild_search_index') {
      return { status: 'rebuilding', strategy: 'cjk-trigram' };
    }
    return null;
  });
  const invoke = invokeMock as unknown as NativeInvoke;
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  await expect(updateFullTextSearchIndexStrategy('cjk-trigram')).resolves.toEqual({
    status: 'rebuilding',
    strategy: 'cjk-trigram'
  });
  expect(invokeMock.mock.calls.at(-2)).toEqual([
    'save_app_settings_state',
    { settings: { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' } }
  ]);
  expect(invokeMock.mock.calls.at(-1)).toEqual(['rebuild_search_index', { strategy: 'cjk-trigram' }]);
});

it('keeps the old search enhancement update API mapped to strategy rebuilds', async () => {
  const invokeMock = vi.fn(async (command: string) => {
    if (command === 'save_app_settings_state') return null;
    if (command === 'rebuild_search_index') return { status: 'rebuilding', strategy: 'word-based' };
    return null;
  });
  window.electronAPI = {
    invoke: invokeMock as unknown as NativeInvoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  await expect(updateSearchEnhancementEnabled(false)).resolves.toEqual({
    status: 'rebuilding',
    strategy: 'word-based'
  });
  expect(invokeMock.mock.calls.at(-1)).toEqual(['rebuild_search_index', { strategy: 'word-based' }]);
});
