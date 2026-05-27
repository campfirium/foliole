import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy
} from '../../../lib/core/database/fullTextSearchIndexStrategy';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const TRUE_VALUE = 'true';

export function isSearchEnhancementEnabled() {
  return normalizeFullTextSearchIndexStrategy(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)
  ) === 'cjk-trigram';
}

export function setSearchEnhancementEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(
    FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
    enabled ? 'cjk-trigram' : 'word-based'
  );
}

export function isSearchEnhancementPromptDismissed() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed) === TRUE_VALUE;
}

export function dismissSearchEnhancementPrompt() {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.searchEnhancementPromptDismissed, TRUE_VALUE);
}

export function shouldShowSearchEnhancementPrompt() {
  return !isSearchEnhancementEnabled() && !isSearchEnhancementPromptDismissed();
}

export function dismissSearchEnhancementPromptIfEnabled() {
  if (isSearchEnhancementEnabled() && !isSearchEnhancementPromptDismissed()) {
    dismissSearchEnhancementPrompt();
  }
}
