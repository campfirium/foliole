import { beforeEach, expect, it } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../../lib/core/database/fullTextSearchIndexStrategy';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  dismissSearchEnhancementPrompt,
  dismissSearchEnhancementPromptIfEnabled,
  isSearchEnhancementEnabled,
  isSearchEnhancementPromptDismissed,
  setSearchEnhancementEnabled,
  shouldShowSearchEnhancementPrompt
} from './searchEnhancementSettings';
import { getLocalStorageWhitelist } from './storage';

beforeEach(() => {
  window.localStorage.clear();
});

it('stores search enhancement in the existing full-text search strategy setting', () => {
  expect(isSearchEnhancementEnabled()).toBe(false);

  setSearchEnhancementEnabled(true);

  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('cjk-trigram');
  expect(isSearchEnhancementEnabled()).toBe(true);

  setSearchEnhancementEnabled(false);

  expect(window.localStorage.getItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY)).toBe('word-based');
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
