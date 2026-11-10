import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../../shared/platform/storage';

const key = APP_SETTINGS_STORAGE_KEYS.topicPostponeUnit;

export function readTopicPostponeUnit(): 'weeks' | 'days' {
  return getWhitelistedLocalStorageItem(key) === 'days' ? 'days' : 'weeks';
}

export function writeTopicPostponeUnit(unit: 'weeks' | 'days') {
  setWhitelistedLocalStorageItem(key, unit);
}
