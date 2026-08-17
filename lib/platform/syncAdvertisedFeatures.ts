export const CURRENT_SYNC_ADVERTISED_FEATURES = Object.freeze([] as string[]);

export function normalizeSyncAdvertisedFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean))].sort();
}

export function isKnownMobileSyncDeviceKind(value: unknown) {
  return value === 'android' || value === 'android-capacitor' || value === 'ios' || value === 'ios-capacitor';
}
