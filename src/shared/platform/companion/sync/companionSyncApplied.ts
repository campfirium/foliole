const listeners = new Set<() => void>();

export function subscribeCompanionSyncApplied(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishCompanionSyncApplied() {
  for (const listener of listeners) {
    try { listener(); }
    catch { /* A view observer cannot invalidate an already committed object. */ }
  }
}
