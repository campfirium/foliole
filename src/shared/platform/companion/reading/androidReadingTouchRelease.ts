import { getCompanionRuntimeCapability } from '../../companionRuntimeCapabilities';

const eventName = 'foliole-android-reading-touch-release';

export function subscribeAndroidReadingTouchRelease(listener: () => void) {
  if (getCompanionRuntimeCapability().kind !== 'android-native') return;
  document.addEventListener(eventName, listener);
  return () => document.removeEventListener(eventName, listener);
}
