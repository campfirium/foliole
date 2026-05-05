import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const AUTO_LOCALIZE_REMOTE_IMAGES_KEY = APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages;
export const AUTO_LOCALIZE_REMOTE_IMAGES_DEFAULT = true;

export function shouldAutoLocalizeRemoteImages() {
  const raw = getWhitelistedLocalStorageItem(AUTO_LOCALIZE_REMOTE_IMAGES_KEY);
  if (raw === null) {
    return AUTO_LOCALIZE_REMOTE_IMAGES_DEFAULT;
  }
  return raw !== 'false';
}

export function setAutoLocalizeRemoteImages(value: boolean) {
  setWhitelistedLocalStorageItem(AUTO_LOCALIZE_REMOTE_IMAGES_KEY, value ? 'true' : 'false');
}
