import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../shared/platform/storage';

const STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.feedbackRememberedContact;

export function readRememberedFeedbackContact() {
  return getWhitelistedLocalStorageItem(STORAGE_KEY) ?? '';
}

export function updateRememberedFeedbackContact(contact: string) {
  const normalizedContact = contact.trim();
  if (normalizedContact) {
    setWhitelistedLocalStorageItem(STORAGE_KEY, normalizedContact);
    return;
  }
  removeWhitelistedLocalStorageItem(STORAGE_KEY);
}
