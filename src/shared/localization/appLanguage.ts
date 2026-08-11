import {
  APP_LOCALE_MANIFEST,
  APP_LOCALES,
  resolveRegisteredAppLocale,
  type RegisteredAppLocale
} from '../../../lib/core/localization/appLocaleRegistry';
import { readPrimaryLanguage } from '../../../lib/core/localization/systemLanguage';
import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../platform/storage';

export type AppLocale = RegisteredAppLocale;
export const APP_LANGUAGE_PREFERENCES = ['system', ...APP_LOCALES] as const;
export type AppLanguagePreference = (typeof APP_LANGUAGE_PREFERENCES)[number];

export const APP_LANGUAGE_OPTIONS = APP_LOCALES.map((locale) => ({
  label: APP_LOCALE_MANIFEST[locale].nativeName,
  value: locale
}));

const DEFAULT_APP_LOCALE: AppLocale = 'en';
const DEFAULT_APP_LANGUAGE_PREFERENCE: AppLanguagePreference = 'system';
export const APP_LANGUAGE_STORAGE_KEY = APP_SETTINGS_STORAGE_KEYS.appLanguage;

export function isAppLanguagePreference(value: string): value is AppLanguagePreference {
  return APP_LANGUAGE_PREFERENCES.includes(value as AppLanguagePreference);
}

function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale);
}

function resolveDevAppLocaleOverride(): AppLocale | null {
  const overrideEnabled = import.meta.env.DEV ||
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITE_FOLIOLE_INTERNAL_BUILD === '1';
  const override = import.meta.env.VITE_FOLIOLE_DEV_APP_LANGUAGE;
  if (!overrideEnabled || !override) {
    return null;
  }
  return isAppLocale(override) ? override : null;
}

export function resolveSystemAppLocale(languages: readonly string[] = getNavigatorLanguages()): AppLocale {
  return resolveRegisteredAppLocale(readPrimaryLanguage(languages)) ?? DEFAULT_APP_LOCALE;
}

export function resolveAppLocale(preference: AppLanguagePreference): AppLocale {
  return resolveDevAppLocaleOverride() ?? (preference === 'system' ? resolveSystemAppLocale() : preference);
}

export function getStoredAppLocale(): AppLocale {
  return resolveAppLocale(getStoredAppLanguagePreference());
}

export function getStoredAppLanguagePreference(): AppLanguagePreference {
  return getPersistedAppLanguagePreference() ?? DEFAULT_APP_LANGUAGE_PREFERENCE;
}

export function getPersistedAppLanguagePreference(): AppLanguagePreference | null {
  const storedPreference = getWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY);
  return storedPreference && isAppLanguagePreference(storedPreference) ? storedPreference : null;
}

export function setStoredAppLanguagePreference(preference: AppLanguagePreference) {
  setWhitelistedLocalStorageItem(APP_LANGUAGE_STORAGE_KEY, preference);
}

export function setStoredAppLocale(locale: AppLocale) {
  setStoredAppLanguagePreference(locale);
}

function getNavigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  if (navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}
