import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from './storage';

const FOLIOLE_AIDE_ENABLED_EVENT = 'foliole-aide-enabled-change';

export function getFolioleAideEnabled() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled) === 'true';
}

export function setFolioleAideEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, String(enabled));
  window.dispatchEvent(new CustomEvent(FOLIOLE_AIDE_ENABLED_EVENT, { detail: { enabled } }));
}

export function subscribeFolioleAideEnabled(listener: (enabled: boolean) => void) {
  const handler = (event: Event) => {
    listener(Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled));
  };
  window.addEventListener(FOLIOLE_AIDE_ENABLED_EVENT, handler);
  return () => window.removeEventListener(FOLIOLE_AIDE_ENABLED_EVENT, handler);
}
