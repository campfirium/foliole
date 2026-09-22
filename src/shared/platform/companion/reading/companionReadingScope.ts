// A content lifetime, independent of the selected sync provider.
let scope = {};
const listeners = new Set<() => void>();

export function getCompanionReadingScope() {
  return scope;
}

export function invalidateCompanionReadingScope() {
  scope = {};
  for (const listener of listeners) {
    try { listener(); } catch {
      // Observers cannot interrupt closing or clearing the database.
    }
  }
}

export function subscribeCompanionReadingScope(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
