import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

export const AUTO_LOCALIZE_REMOTE_IMAGES_KEY = APP_SETTINGS_STORAGE_KEYS.autoLocalizeRemoteImages;
export const AUTO_LOCALIZE_REMOTE_IMAGES_DEFAULT = true;
export type RemoteImageLocalizationPreference = 'disabled' | 'enabled' | 'unset';

export function getAutoLocalizeRemoteImagesPreference(): RemoteImageLocalizationPreference {
  const raw = getWhitelistedLocalStorageItem(AUTO_LOCALIZE_REMOTE_IMAGES_KEY);
  if (raw === null) {
    return 'unset';
  }
  return raw === 'false' ? 'disabled' : 'enabled';
}

export function shouldAutoLocalizeRemoteImages() {
  const preference = getAutoLocalizeRemoteImagesPreference();
  return preference === 'unset' ? AUTO_LOCALIZE_REMOTE_IMAGES_DEFAULT : preference === 'enabled';
}

export function setAutoLocalizeRemoteImages(value: boolean) {
  setWhitelistedLocalStorageItem(AUTO_LOCALIZE_REMOTE_IMAGES_KEY, value ? 'true' : 'false');
}
