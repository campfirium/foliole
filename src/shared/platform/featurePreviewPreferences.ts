import { useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';

import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from './storage';

const KEY = APP_SETTINGS_STORAGE_KEYS.experimentalFeatures;
const CHANGED = 'foliole:experimental-features-changed';
const EMPTY = '[]';

export function getFeaturePreviewPreferences() {
  return getWhitelistedLocalStorageItem(KEY) ?? EMPTY;
}

function readEnabledFeatures(snapshot: string): string[] {
  try {
    const value: unknown = JSON.parse(snapshot);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isExperimentalFeatureEnabled(id: string, snapshot = getFeaturePreviewPreferences()) {
  return readEnabledFeatures(snapshot).includes(id);
}

export function setExperimentalFeatureEnabled(id: string, enabled: boolean) {
  const selected = new Set(readEnabledFeatures(getFeaturePreviewPreferences()));
  if (enabled) selected.add(id);
  else selected.delete(id);
  setWhitelistedLocalStorageItem(KEY, JSON.stringify([...selected]));
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useFeaturePreviewPreferences() {
  return useSyncExternalStore(subscribe, getFeaturePreviewPreferences, () => EMPTY);
}
