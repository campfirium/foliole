export const SOURCE_OWNERSHIP_SYNC_FEATURE = 'desktop-source-ownership-v1';

export const CURRENT_SYNC_ADVERTISED_FEATURES = Object.freeze([
  SOURCE_OWNERSHIP_SYNC_FEATURE
]);

export function normalizeSyncAdvertisedFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean))].sort();
}

export function hasSourceOwnershipSyncFeature(value: unknown) {
  return normalizeSyncAdvertisedFeatures(value).includes(SOURCE_OWNERSHIP_SYNC_FEATURE);
}

export function isKnownMobileSyncDeviceKind(value: unknown) {
  return value === 'android' || value === 'android-capacitor' || value === 'ios' || value === 'ios-capacitor';
}
