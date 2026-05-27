import { useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const MENU_HELP_TOOLTIPS_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.menuHelpTooltipsEnabled;
const MENU_HELP_TOOLTIPS_CHANGED_EVENT = 'foliole:menu-help-tooltips-changed';

export function getMenuHelpTooltipsEnabled() {
  return getWhitelistedLocalStorageItem(MENU_HELP_TOOLTIPS_STORAGE_KEY) !== 'false';
}

export function setMenuHelpTooltipsEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(MENU_HELP_TOOLTIPS_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event(MENU_HELP_TOOLTIPS_CHANGED_EVENT));
}

function subscribeMenuHelpTooltips(listener: () => void) {
  window.addEventListener(MENU_HELP_TOOLTIPS_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(MENU_HELP_TOOLTIPS_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useMenuHelpTooltipsEnabled() {
  return useSyncExternalStore(
    subscribeMenuHelpTooltips,
    getMenuHelpTooltipsEnabled,
    () => true
  );
}
