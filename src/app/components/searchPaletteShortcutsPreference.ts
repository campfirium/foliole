import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

const COLLAPSED_VALUE = 'true';

export function loadSearchPaletteShortcutsCollapsed() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.searchPaletteShortcutsCollapsed) === COLLAPSED_VALUE;
}

export function saveSearchPaletteShortcutsCollapsed(collapsed: boolean) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.searchPaletteShortcutsCollapsed,
    collapsed ? COLLAPSED_VALUE : 'false'
  );
}
