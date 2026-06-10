const OPEN_CLOZE_GUARD_SETTINGS_EVENT = 'foliole:open-cloze-guard-settings';

export function dispatchOpenClozeGuardSettings() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_CLOZE_GUARD_SETTINGS_EVENT));
}

export function subscribeOpenClozeGuardSettings(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(OPEN_CLOZE_GUARD_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(OPEN_CLOZE_GUARD_SETTINGS_EVENT, handler);
}
