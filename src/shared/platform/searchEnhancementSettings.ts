import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy
} from '../../../lib/core/database/fullTextSearchIndexStrategy';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { saveRuntimeAppSettingsState } from './appSettingsState';
import {
  requestSearchIndexRebuild,
  type SearchIndexRebuildStatus
} from './searchIndexRebuildStatus';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const TRUE_VALUE = 'true';

export function isSearchEnhancementEnabled() {
  return normalizeFullTextSearchIndexStrategy(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)
  ) === 'cjk-trigram';
}

export function setSearchEnhancementEnabled(enabled: boolean) {
  setSearchEnhancementStrategy(enabled ? 'cjk-trigram' : 'word-based');
}

function setSearchEnhancementStrategy(strategy: 'cjk-trigram' | 'word-based') {
  setWhitelistedLocalStorageItem(
    FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
    strategy
  );
}

export async function updateSearchEnhancementEnabled(enabled: boolean): Promise<SearchIndexRebuildStatus | null> {
  const previous = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy);
  const strategy = enabled ? 'cjk-trigram' : 'word-based';
  setSearchEnhancementStrategy(strategy);
  const saved = await saveRuntimeAppSettingsState({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy });
  if (!saved) {
    setSearchEnhancementStrategy(previous === 'cjk-trigram' ? 'cjk-trigram' : 'word-based');
    throw new Error('search enhancement setting could not be saved');
  }
  const status = await requestSearchIndexRebuild(strategy);
  if (!status) {
    throw new Error('search enhancement rebuild could not be started');
  }
  return status;
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
