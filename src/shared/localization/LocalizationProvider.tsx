import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  getStoredAppLanguagePreference,
  getStoredAppLocale,
  resolveAppLocale,
  setStoredAppLanguagePreference,
  setStoredAppLocale,
  type AppLanguagePreference,
  type AppLocale
} from './appLanguage';
import {
  hasTranslationCatalog,
  preloadTranslationCatalog,
  translate,
  type TranslationKey,
  type TranslationParams
} from './translations';

interface LocalizationContextValue {
  languagePreference: AppLanguagePreference;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  setLanguagePreference: (preference: AppLanguagePreference) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export type Translate = LocalizationContextValue['t'];

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [languagePreference, setLanguagePreferenceState] = useState(getStoredAppLanguagePreference);
  const [locale, setLocaleState] = useState(getStoredAppLocale);
  const [, setCatalogVersion] = useState(0);
  const catalogReady = hasTranslationCatalog(locale);
  const setLocale = useCallback((nextLocale: AppLocale) => {
    setStoredAppLocale(nextLocale);
    setLanguagePreferenceState(nextLocale);
    setLocaleState(nextLocale);
  }, []);
  const setLanguagePreference = useCallback((nextPreference: AppLanguagePreference) => {
    setStoredAppLanguagePreference(nextPreference);
    setLanguagePreferenceState(nextPreference);
    setLocaleState(resolveAppLocale(nextPreference));
  }, []);
  const t = useCallback((key: TranslationKey, params?: TranslationParams) => translate(locale, key, params), [locale]);
  const value = useMemo(
    () => ({ languagePreference, locale, setLanguagePreference, setLocale, t }),
    [languagePreference, locale, setLanguagePreference, setLocale, t]
  );
  useEffect(() => {
    if (catalogReady) {
      return undefined;
    }
    let active = true;
    void preloadTranslationCatalog(locale).then(() => {
      if (active) {
        setCatalogVersion((version) => version + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [catalogReady, locale]);

  if (!catalogReady) {
    return null;
  }
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('LocalizationProvider is missing.');
  }
  return context;
}

export function useTranslation() {
  return useLocalization().t;
}
