import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  getStoredAppLocale,
  setStoredAppLocale,
  type AppLocale
} from './appLanguage';
import { translate, type TranslationKey, type TranslationParams } from './translations';

interface LocalizationContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export type Translate = LocalizationContextValue['t'];

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(getStoredAppLocale);
  const setLocale = useCallback((nextLocale: AppLocale) => {
    setStoredAppLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);
  const t = useCallback((key: TranslationKey, params?: TranslationParams) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

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
