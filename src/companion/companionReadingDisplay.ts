import { useMemo, useSyncExternalStore } from 'react';

export interface CompanionReadingDisplay {
  overlayToolbars: boolean;
  hideSystemStatusBar: boolean;
}
const KEY = 'foliole-companion-reading-display';
const listeners = new Set<() => void>();
const defaults: CompanionReadingDisplay = { overlayToolbars: false, hideSystemStatusBar: false };
function snapshot() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function parse(value: string | null): CompanionReadingDisplay {
  try {
    const raw = JSON.parse(value ?? 'null');
    return { overlayToolbars: raw?.overlayToolbars === true, hideSystemStatusBar: raw?.hideSystemStatusBar === true };
  } catch { return defaults; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
}
export function saveCompanionReadingDisplay(patch: Partial<CompanionReadingDisplay>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...parse(snapshot()), ...patch }));
    listeners.forEach(listener => listener());
    return true;
  } catch { return false; }
}
export function useCompanionReadingDisplay() {
  const raw = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => parse(raw), [raw]);
}
