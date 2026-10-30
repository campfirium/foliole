import { createContext } from 'react';

import type { AppLanguagePreference, AppLocale } from './appLanguage';
import type { TranslationKey, TranslationParams } from './translations';

export interface LocalizationContextValue {
  languagePreference: AppLanguagePreference;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  setLanguagePreference: (preference: AppLanguagePreference) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

// Keep context identity independent of provider and translation hot updates.
export const LocalizationContext = createContext<LocalizationContextValue | null>(null);
