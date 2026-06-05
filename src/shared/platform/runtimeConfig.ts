import { getElectronAPI } from './electronApi';

export function getGuidedSampleLocaleOverride() {
  return getElectronAPI()?.runtimeConfig?.guidedSampleLocale ?? null;
}
