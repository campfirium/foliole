export const DESKTOP_FOREGROUND_DEBOUNCE_MS = 10_000;
/** Input this recent still counts as someone settling on the window that just took focus. */
const DESKTOP_FOREGROUND_INPUT_SLACK_MS = 2_000;

type Listener = (foreground: boolean) => void;

let foreground = false;
let idleSeconds: () => number = () => 0;
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
    // A window left in front of an unattended machine can regain focus without anyone there.
    if (idleSeconds() * 1000 <= debounceMs + DESKTOP_FOREGROUND_INPUT_SLACK_MS) setForeground(true);
  }, debounceMs);
}

/**
 * Another desktop just became foreground. Unless someone is still using this machine, in Foliole or
 * any other app, the user has moved there and this older foreground steps down so that desktop leads.
 */
export function yieldDesktopForeground() {
  if (idleSeconds() * 1000 < DESKTOP_FOREGROUND_DEBOUNCE_MS) return;
  clearPending();
  setForeground(false);
}

/** Seconds since the last keyboard or mouse input on this machine, whichever window it went to. */
export function setDesktopIdleSecondsSource(source: () => number) {
  idleSeconds = source;
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
