export function isMobileSyncPlatform(platform: string) {
  const normalized = platform.trim().toLowerCase();
  return normalized === 'android' || normalized === 'android-capacitor'
    || normalized === 'ios' || normalized === 'ios-capacitor';
}
