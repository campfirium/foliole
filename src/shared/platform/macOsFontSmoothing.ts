import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getElectronAPI } from './electronApi';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const FONT_SMOOTHING_PROPERTY = '-webkit-font-smoothing';

export function supportsMacOsFontSmoothingSetting(
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  hasElectronInvoke = typeof getElectronAPI()?.invoke === 'function'
) {
  return hasElectronInvoke && `${platform} ${userAgent}`.toLowerCase().includes('mac');
}

export function resolveMacOsFontSmoothingEnabled(value: string | null | undefined) {
  return value !== 'false';
}

export function getMacOsFontSmoothingEnabled() {
  return resolveMacOsFontSmoothingEnabled(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing)
  );
}

export function applyMacOsFontSmoothing(
  enabled: boolean,
  root = document.documentElement,
  supported = supportsMacOsFontSmoothingSetting()
) {
  if (supported && enabled) {
    root.style.setProperty(FONT_SMOOTHING_PROPERTY, 'antialiased');
    return;
  }
  root.style.removeProperty(FONT_SMOOTHING_PROPERTY);
}

export function applyMacOsFontSmoothingFromSettings(
  settings: Record<string, string>,
  root = document.documentElement,
  supported = supportsMacOsFontSmoothingSetting()
) {
  applyMacOsFontSmoothing(
    resolveMacOsFontSmoothingEnabled(settings[APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing]),
    root,
    supported
  );
}

export function setMacOsFontSmoothingEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.macOsFontSmoothing, String(enabled));
  applyMacOsFontSmoothing(enabled);
}
