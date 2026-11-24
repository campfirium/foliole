let revision = 0;
const listeners = new Set<() => void>();

export function getCompanionExternalVisibilityRevision() {
  return revision;
}

export function subscribeCompanionExternalVisibility(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishCompanionExternalVisibilityChanged() {
  revision += 1;
  for (const listener of listeners) {
    try { listener(); }
    catch { /* A view observer cannot invalidate committed membership. */ }
  }
}
