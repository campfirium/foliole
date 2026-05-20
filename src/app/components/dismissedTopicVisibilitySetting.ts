import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

const TRUE_VALUE = 'true';
export const TOGGLE_DISMISSED_TOPIC_VISIBILITY_EVENT = 'foliole:toggle-dismissed-topic-visibility';

export function getViewHideDismissedTopics() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics) === TRUE_VALUE;
}

export function setViewHideDismissedTopics(value: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics, value ? TRUE_VALUE : 'false');
}

export function requestToggleDismissedTopicVisibility() {
  window.dispatchEvent(new CustomEvent(TOGGLE_DISMISSED_TOPIC_VISIBILITY_EVENT));
}
