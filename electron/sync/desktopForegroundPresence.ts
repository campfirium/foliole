export const DESKTOP_FOREGROUND_DEBOUNCE_MS = 10_000;

type Listener = (foreground: boolean) => void;

let foreground = false;
let debounceMs = DESKTOP_FOREGROUND_DEBOUNCE_MS;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/** Last desktop the user settled on; leaving the window alone keeps it, only lock or sleep ends it. */
export function isDesktopForeground() {
  return foreground;
}

export function subscribeDesktopForeground(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateDesktopFocus(state: Readonly<{ focused: boolean; available: boolean }>) {
  if (!state.available) {
    clearPending();
    setForeground(false);
    return;
  }
  if (!state.focused) {
    clearPending();
    return;
  }
  if (foreground || timer) return;
  timer = setTimeout(() => {
    timer = null;
    setForeground(true);
  }, debounceMs);
}

/** Integration fixtures settle focus without waiting through the user-facing debounce. */
export function setDesktopForegroundDebounceMs(value: number) {
  debounceMs = value;
}

function clearPending() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function setForeground(next: boolean) {
  if (foreground === next) return;
  foreground = next;
  for (const listener of listeners) listener(next);
}
