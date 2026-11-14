const IMMERSIVE_READING_TOGGLE_EVENT = 'foliole:immersive-reading-toggle';

export function requestImmersiveReadingToggle() {
  window.dispatchEvent(new Event(IMMERSIVE_READING_TOGGLE_EVENT));
}

export function subscribeImmersiveReadingToggle(toggle: () => void) {
  window.addEventListener(IMMERSIVE_READING_TOGGLE_EVENT, toggle);
  return () => window.removeEventListener(IMMERSIVE_READING_TOGGLE_EVENT, toggle);
}
