import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

const REMOTE_IMAGE_FAILURE_HINT_DISMISSED_KEY = APP_SETTINGS_STORAGE_KEYS.remoteImageFailureHintDismissed;

let sessionDismissed = false;

export function shouldShowRemoteImageFailureHint() {
  return !sessionDismissed && getWhitelistedLocalStorageItem(REMOTE_IMAGE_FAILURE_HINT_DISMISSED_KEY) !== 'true';
}

export function dismissRemoteImageFailureHintForSession() {
  sessionDismissed = true;
}

export function dismissRemoteImageFailureHintPermanently() {
  sessionDismissed = true;
  setWhitelistedLocalStorageItem(REMOTE_IMAGE_FAILURE_HINT_DISMISSED_KEY, 'true');
}

export function resetRemoteImageFailureHintDismissalForTests() {
  sessionDismissed = false;
}
