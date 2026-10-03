export const COMPANION_ANDROID_BACK_EVENT = 'companion-android-back';
export const COMPANION_ANDROID_CAPTURE_BACK_EVENT = 'companion-android-capture-back';

export function dispatchCompanionAndroidBack(type = COMPANION_ANDROID_BACK_EVENT): boolean {
  const event = new Event(type, { cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}
