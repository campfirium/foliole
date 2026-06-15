import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  normalizeFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy
} from '../../../lib/core/database/fullTextSearchIndexStrategy';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { saveRuntimeAppSettingsState } from './appSettingsState';
import {
  requestSearchIndexRebuild,
  type SearchIndexRebuildStatus
} from './searchIndexRebuildStatus';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const TRUE_VALUE = 'true';

export type { FullTextSearchIndexStrategy };

export function getFullTextSearchIndexStrategy() {
  return normalizeFullTextSearchIndexStrategy(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.fullTextSearchIndexStrategy)
  );
}

export function setFullTextSearchIndexStrategy(strategy: FullTextSearchIndexStrategy) {
  setWhitelistedLocalStorageItem(FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY, strategy);
}

export async function updateFullTextSearchIndexStrategy(strategy: FullTextSearchIndexStrategy): Promise<SearchIndexRebuildStatus | null> {
  const previous = getFullTextSearchIndexStrategy();
  setFullTextSearchIndexStrategy(strategy);
  const saved = await saveRuntimeAppSettingsState({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy });
  if (!saved) {
    setFullTextSearchIndexStrategy(previous);
    throw new Error('full-text search language setting could not be saved');
  }
  const status = await requestSearchIndexRebuild(strategy);
  if (!status) {
    throw new Error('full-text search index rebuild could not be started');
  }
  return status;
}

export function isSearchEnhancementEnabled() {
  return getFullTextSearchIndexStrategy() === 'cjk-trigram';
}

export function setSearchEnhancementEnabled(enabled: boolean) {
  setFullTextSearchIndexStrategy(enabled ? 'cjk-trigram' : 'word-based');
}

export async function updateSearchEnhancementEnabled(enabled: boolean): Promise<SearchIndexRebuildStatus | null> {
  return updateFullTextSearchIndexStrategy(enabled ? 'cjk-trigram' : 'word-based');
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
