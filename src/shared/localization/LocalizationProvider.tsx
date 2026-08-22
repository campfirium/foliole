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
import { getCustomCopyOverride, useCustomCopyOverridesSnapshot } from './customCopyOverrides';
import { useSystemEntryDisplayNamesSnapshot } from './systemEntryDisplayNamesStore';
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

interface LocalizationProviderProps {
  children: ReactNode;
  initialLanguagePreference?: AppLanguagePreference | undefined;
}

export function LocalizationProvider({ children, initialLanguagePreference }: LocalizationProviderProps) {
  const customCopySnapshot = useCustomCopyOverridesSnapshot();
  const systemEntryNames = useSystemEntryDisplayNamesSnapshot();
  const [languagePreference, setLanguagePreferenceState] = useState(
    () => initialLanguagePreference ?? getStoredAppLanguagePreference()
  );
  const [locale, setLocaleState] = useState(() =>
    initialLanguagePreference ? resolveAppLocale(initialLanguagePreference) : getStoredAppLocale()
  );
  const [catalogVersion, setCatalogVersion] = useState(0);
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
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => {
      const custom = getCustomCopyOverride(locale, key);
      return custom === undefined ? translate(locale, key, params) : interpolateCustomCopy(custom, params);
    },
    [catalogVersion, customCopySnapshot, locale]
  );
  const value = useMemo(
    () => ({ languagePreference, locale, setLanguagePreference, setLocale, t }),
    [languagePreference, locale, setLanguagePreference, setLocale, systemEntryNames.revision, t]
  );
  useEffect(() => {
    if (catalogReady) {
      return undefined;
    }
    let active = true;
    void preloadTranslationCatalog(locale).then((loaded) => {
      if (active && loaded) {
        setCatalogVersion((version) => version + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [catalogReady, locale]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

function interpolateCustomCopy(template: string, params?: TranslationParams) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
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
