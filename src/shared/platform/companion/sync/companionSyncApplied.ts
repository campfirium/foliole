import type { WorkspaceRefreshScope } from '../../../../../lib/core/database/workspaceSnapshotRefresh.js';
import { registerCompanionWorkspaceRefresh } from '../companionWorkspaceSnapshotStore.js';

import { publishCompanionSyncMutationRevision } from './mutation/companionSyncMutationRevision.js';

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

/**
 * Joining, adopting or leaving a group can change the whole library. The full reread runs now through the applied-refresh
 * observers, so it is not left registered for the next edit's refresh to pay for.
 */
export function publishCompanionSyncMembershipChanged() {
  publishCompanionSyncMutationRevision({ kind: 'full' });
  publishCompanionSyncApplied({ kind: 'full' });
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
