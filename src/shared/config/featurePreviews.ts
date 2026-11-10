import type { TranslationKey } from '../localization/translations';
import {
  isExperimentalFeatureEnabled,
  useFeaturePreviewPreferences
} from '../platform/runtime/featurePreviewPreferences';

import featurePreviews from './featurePreviews.json';

type FeaturePreviewId = keyof typeof featurePreviews;

export function isInternalFeaturePreviewBuild() {
  return import.meta.env.MODE === 'development' || import.meta.env.MODE === 'internal';
}

export function getExperimentalFeaturePreviews() {
  return (Object.keys(featurePreviews) as FeaturePreviewId[])
    .filter(id => featurePreviews[id].visibility === 'experimental')
    .map(id => ({ id, labelKey: featurePreviews[id].labelKey as TranslationKey }));
}

export function isFeaturePreviewVisible(feature: FeaturePreviewId, preferences?: string): boolean {
  const { visibility } = featurePreviews[feature];
  return visibility === 'public' ||
    isInternalFeaturePreviewBuild() ||
    (visibility === 'experimental' && isExperimentalFeatureEnabled(feature, preferences));
}

export function useFeaturePreviewVisible(feature: FeaturePreviewId) {
  return isFeaturePreviewVisible(feature, useFeaturePreviewPreferences());
}
