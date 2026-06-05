import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../platform/storage';

export const APP_LOCALES = ['en', 'zh-Hans'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = 'en';
export const APP_LANGUAGE_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.appLanguage;

export function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale);
}

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  return value && isAppLocale(value) ? value : DEFAULT_APP_LOCALE;
}

export function getStoredAppLocale(): AppLocale {
  return normalizeAppLocale(getWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY));
}

export function setStoredAppLocale(locale: AppLocale) {
  setWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY, locale);
}
