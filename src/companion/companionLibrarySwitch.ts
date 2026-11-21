import { useSyncExternalStore } from 'react';

export type CompanionLibrarySwitchState =
  | { step: 'idle' }
  | { step: 'switching' }
  | { step: 'failed'; message: string };

let state: CompanionLibrarySwitchState = { step: 'idle' };
const listeners = new Set<() => void>();

function publish(next: CompanionLibrarySwitchState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCompanionLibrarySwitch() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

function afterPaint() {
  return new Promise<void>(resolve => {
    const next = globalThis.requestAnimationFrame ?? ((callback: () => void) => globalThis.setTimeout(callback, 16));
    next(() => globalThis.setTimeout(resolve, 0));
  });
}

/**
 * Take the whole shell off screen before the library closes, so nothing still mounted can read
 * a closed database between the close and the reload that opens the swapped library.
 */
export async function closeForCompanionLibrarySwitch(close: () => Promise<void>) {
  publish({ step: 'switching' });
  await afterPaint();
  await close();
}

/** Report a failure on the root surface once the shell is gone; false while the shell is still shown. */
export function failCompanionLibrarySwitch(message: string) {
  if (state.step !== 'switching') return false;
  publish({ step: 'failed', message });
  return true;
}

export function resetCompanionLibrarySwitchForTest() { publish({ step: 'idle' }); }
