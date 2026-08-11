import { getElectronAPI } from './electronApi';

export function getGuidedSampleLocaleOverride() {
  return getElectronAPI()?.runtimeConfig?.guidedSampleLocale ?? null;
}

export function getRuntimeSystemLanguage(): string | null | undefined {
  const electronApi = getElectronAPI();
  if (!electronApi) {
    return undefined;
  }
  return electronApi.runtimeConfig?.systemLanguage ?? null;
}
