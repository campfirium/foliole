import appLocaleManifest from './appLocaleManifest.json' with { type: 'json' };
import { normalizeLanguageTag } from './systemLanguage.js';

export type RegisteredAppLocale = keyof typeof appLocaleManifest.locales;
type LocaleDefinition = {
  nativeName: string;
  systemLanguagePrefixes?: readonly string[];
  systemLanguageTags?: readonly string[];
};

export const APP_LOCALE_MANIFEST = appLocaleManifest.locales;
export const APP_LOCALES = Object.keys(APP_LOCALE_MANIFEST) as RegisteredAppLocale[];

export function resolveRegisteredAppLocale(language: string): RegisteredAppLocale | null {
  const normalized = normalizeLanguageTag(language);
  for (const locale of APP_LOCALES) {
    const definition = APP_LOCALE_MANIFEST[locale] as LocaleDefinition;
    if (definition.systemLanguageTags?.includes(normalized)) {
      return locale;
    }
    if (definition.systemLanguagePrefixes?.some((prefix) =>
      normalized === prefix || normalized.startsWith(`${prefix}-`)
    )) {
      return locale;
    }
  }
  return null;
}
