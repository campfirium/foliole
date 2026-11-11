import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh.js';
import { registerCompanionWorkspaceRefresh } from '../companionWorkspaceSnapshotStore.js';

const listeners = new Set<() => void>();

export function subscribeCompanionSyncApplied(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishCompanionSyncApplied(scope: WorkspaceRefreshScope = { kind: 'full' }) {
  registerCompanionWorkspaceRefresh(scope);
  for (const listener of listeners) {
    try { listener(); }
    catch { /* A view observer cannot invalidate an already committed object. */ }
  }
}

const readingResumeListeners = new Set<(nodeId: string) => void>();

export function subscribeCompanionReadingResumeApplied(listener: (nodeId: string) => void) {
  readingResumeListeners.add(listener);
  return () => { readingResumeListeners.delete(listener); };
}

export function publishCompanionReadingResumeApplied(nodeId: string) {
  for (const listener of readingResumeListeners) {
    try { listener(nodeId); }
    catch { /* An observer cannot invalidate an already committed reading position. */ }
  }
}
