import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const TRUE_VALUE = 'true';
const DISMISSED_TOPIC_VISIBILITY_EVENT = 'foliole:dismissed-topic-visibility-changed';

export function getViewHideDismissedTopics() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics) === TRUE_VALUE;
}

function setViewHideDismissedTopics(value: boolean) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.viewHideDismissedTopics, value ? TRUE_VALUE : 'false');
}

export function requestToggleDismissedTopicVisibility() {
  setViewHideDismissedTopics(!getViewHideDismissedTopics());
  window.dispatchEvent(new Event(DISMISSED_TOPIC_VISIBILITY_EVENT));
}

export function subscribeDismissedTopicVisibility(listener: () => void) {
  window.addEventListener(DISMISSED_TOPIC_VISIBILITY_EVENT, listener);
  return () => window.removeEventListener(DISMISSED_TOPIC_VISIBILITY_EVENT, listener);
}
