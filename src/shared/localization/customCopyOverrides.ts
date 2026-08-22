import { useSyncExternalStore } from 'react';

import { APP_LOCALES } from '../../../lib/core/localization/appLocaleRegistry';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  removeWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../platform/storage';

import type { AppLocale } from './appLanguage';
import { isTranslationKey, type TranslationKey } from './translations';

type LocaleOverrides = Partial<Record<TranslationKey, string>>;
type CustomCopyOverrides = Partial<Record<AppLocale, LocaleOverrides>>;

const STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.customCopyOverrides;
const CHANGED_EVENT = 'foliole:custom-copy-overrides-changed';
let cachedRaw: string | null | undefined;
let cachedOverrides: CustomCopyOverrides = {};

function normalizeOverrides(value: unknown): CustomCopyOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized: CustomCopyOverrides = {};
  for (const locale of APP_LOCALES) {
    const entries = (value as Record<string, unknown>)[locale];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const localeOverrides: LocaleOverrides = {};
    for (const [key, text] of Object.entries(entries)) {
      if (isTranslationKey(key) && typeof text === 'string' && text.trim()) {
        localeOverrides[key] = text;
      }
    }
    if (Object.keys(localeOverrides).length > 0) normalized[locale] = localeOverrides;
  }
  return normalized;
}

function readOverrides() {
  const raw = getWhitelistedLocalStorageItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedOverrides;
  cachedRaw = raw;
  try {
    cachedOverrides = normalizeOverrides(raw ? JSON.parse(raw) : null);
  } catch {
    cachedOverrides = {};
  }
  return cachedOverrides;
}

function writeOverrides(overrides: CustomCopyOverrides) {
  cachedRaw = undefined;
  if (Object.keys(overrides).length === 0) removeWhitelistedLocalStorageItem(STORAGE_KEY);
  else setWhitelistedLocalStorageItem(STORAGE_KEY, JSON.stringify(overrides));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function getCustomCopyOverride(locale: AppLocale, key: TranslationKey) {
  return readOverrides()[locale]?.[key];
}

export function getCustomCopyOverrides(locale: AppLocale): LocaleOverrides {
  return { ...readOverrides()[locale] };
}

export function buildCustomCopyExport(locale: AppLocale) {
  return { locale, changes: getCustomCopyOverrides(locale) };
}

export function setCustomCopyOverride(locale: AppLocale, key: TranslationKey, text: string | null) {
  const overrides = readOverrides();
  const localeOverrides = { ...overrides[locale] };
  if (text?.trim()) localeOverrides[key] = text.trim();
  else delete localeOverrides[key];
  const next = { ...overrides };
  if (Object.keys(localeOverrides).length > 0) next[locale] = localeOverrides;
  else delete next[locale];
  writeOverrides(next);
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

function getSnapshot() {
  return getWhitelistedLocalStorageItem(STORAGE_KEY) ?? '';
}

export function useCustomCopyOverridesSnapshot() {
  return useSyncExternalStore(subscribe, getSnapshot, () => '');
}
