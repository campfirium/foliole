import featurePreviews from './featurePreviews.json';

export function isFeaturePreviewVisible(feature: keyof typeof featurePreviews): boolean {
  return featurePreviews[feature].visibility === 'public' ||
    import.meta.env.MODE === 'development' || import.meta.env.MODE === 'internal';
}
