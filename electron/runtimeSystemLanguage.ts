import { readPrimaryLanguage } from '../lib/core/localization/systemLanguage.js';

interface PreferredSystemLanguagesSource {
  getPreferredSystemLanguages: () => string[];
}

export const RUNTIME_SYSTEM_LANGUAGE_ENV_KEY = 'FOLIOLE_SYSTEM_LANGUAGE';

export function publishRuntimeSystemLanguage(
  source: PreferredSystemLanguagesSource,
  env: NodeJS.ProcessEnv = process.env
) {
  const language = readPrimaryLanguage(source.getPreferredSystemLanguages()).trim();
  env[RUNTIME_SYSTEM_LANGUAGE_ENV_KEY] = language;
  return language;
}
