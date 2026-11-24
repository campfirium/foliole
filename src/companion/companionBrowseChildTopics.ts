import { useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../shared/platform/storage';

const KEY = APP_SETTINGS_STORAGE_KEYS.companionBrowseShowChildTopics;
const CHANGE_EVENT = 'foliole:companion-browse-child-topics-changed';

/** The Browse list shows child topics unless this device turned them off. */
export function getCompanionBrowseShowChildTopics() {
  return getWhitelistedLocalStorageItem(KEY) !== 'false';
}

export function toggleCompanionBrowseShowChildTopics() {
  setWhitelistedLocalStorageItem(KEY, getCompanionBrowseShowChildTopics() ? 'false' : 'true');
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function useCompanionBrowseShowChildTopics() {
  return useSyncExternalStore(subscribe, getCompanionBrowseShowChildTopics, () => true);
}
