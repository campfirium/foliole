import { useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const ACTION_HELP_CARDS_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.actionHelpCardsEnabled;
const ACTION_HELP_CARDS_CHANGED_EVENT = 'foliole:action-help-cards-changed';

function getActionHelpCardsEnabled() {
  return getWhitelistedLocalStorageItem(ACTION_HELP_CARDS_STORAGE_KEY) !== 'false';
}

export function setActionHelpCardsEnabled(enabled: boolean) {
  setWhitelistedLocalStorageItem(ACTION_HELP_CARDS_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event(ACTION_HELP_CARDS_CHANGED_EVENT));
}

function subscribeActionHelpCards(listener: () => void) {
  window.addEventListener(ACTION_HELP_CARDS_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(ACTION_HELP_CARDS_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useActionHelpCardsEnabled() {
  return useSyncExternalStore(
    subscribeActionHelpCards,
    getActionHelpCardsEnabled,
    () => true
  );
}
