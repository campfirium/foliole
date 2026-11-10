import { useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  RUNTIME_APP_SETTINGS_SAVED_EVENT,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

const changedEvent = 'foliole:folder-section-settings-changed';
const gapKey = APP_SETTINGS_STORAGE_KEYS.folderSectionGap;

export const DEFAULT_FOLDER_SECTION_GAP = 8;
export const MAX_FOLDER_SECTION_GAP = 32;

function normalize(value: number, fallback: number, max: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : fallback;
}

function readNumber(key: string, fallback: number, max: number) {
  const stored = getWhitelistedLocalStorageItem(key);
  return normalize(stored?.trim() ? Number(stored) : fallback, fallback, max);
}

function subscribe(listener: () => void) {
  const events = [changedEvent, 'storage', RUNTIME_APP_SETTINGS_SAVED_EVENT];
  events.forEach(event => window.addEventListener(event, listener));
  return () => events.forEach(event => window.removeEventListener(event, listener));
}

function save(key: string, value: number) {
  setWhitelistedLocalStorageItem(key, String(value));
  window.dispatchEvent(new Event(changedEvent));
}

export function useFolderSectionSettings() {
  const gap = useSyncExternalStore(subscribe, () => readNumber(gapKey, DEFAULT_FOLDER_SECTION_GAP, MAX_FOLDER_SECTION_GAP));
  return { gap };
}

export function setFolderSectionGap(value: number) {
  save(gapKey, normalize(value, DEFAULT_FOLDER_SECTION_GAP, MAX_FOLDER_SECTION_GAP));
}
