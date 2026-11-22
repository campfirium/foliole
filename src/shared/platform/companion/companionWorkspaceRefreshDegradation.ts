/**
 * Why a refresh after a phone write reread the whole library although the write named what it changed:
 * `preview` — the caller handed the refresh a projected snapshot, which a native library rereads completely;
 * `unproven-merge` — a narrow scope reached the refresh but its merge could not be proven against the baseline.
 * Explicit `{ kind: 'full' }` writes and sync rounds are not reported: they ask for the whole library on purpose.
 */
export type CompanionWorkspaceRefreshDegradation = 'preview' | 'unproven-merge';

type Listener = (reason: CompanionWorkspaceRefreshDegradation) => void;
const listeners = new Set<Listener>();

export function subscribeCompanionWorkspaceRefreshDegradation(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reportCompanionWorkspaceRefreshDegradation(reason: CompanionWorkspaceRefreshDegradation) {
  if (import.meta.env.DEV) console.warn(`[Foliole] A refresh after a phone write reread the whole library (${reason}).`);
  for (const listener of listeners) {
    try { listener(reason); } catch { /* An observer cannot change the refresh it was told about. */ }
  }
}
