import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { restoreCompanionTrashNode } from './companionTrashActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;
type RestoreAttempt = { refresh?: () => Promise<unknown>; pending?: Promise<void> };
// Keep a committed restore across article/sheet remounts, only within its library lifetime.
const attemptsByScope = new WeakMap<object, Map<string, RestoreAttempt>>();

export class CompanionTrashRestoreRefreshError extends Error {
  constructor() { super('companion_trash_restored_refresh_failed'); }
}

async function restoreAndRefresh(
  workspaceSync: CompanionWorkspaceSyncApi, nodeId: string, attempt: RestoreAttempt, scope: object
) {
  if (!attempt.refresh) {
    const result = await restoreCompanionTrashNode({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) throw new Error('This topic or folder cannot be restored on this device.');
    attempt.refresh = () => workspaceSync.refreshAfterMutation(result.snapshot);
  }
  if (scope !== getCompanionReadingScope()) throw new Error('companion_restore_library_changed');
  try { await attempt.refresh(); }
  catch { throw new CompanionTrashRestoreRefreshError(); }
}

export function createCompanionTrashRestoreHandler(workspaceSync: CompanionWorkspaceSyncApi) {
  const scope = getCompanionReadingScope();
  let attempts = attemptsByScope.get(scope);
  if (!attempts) { attempts = new Map(); attemptsByScope.set(scope, attempts); }
  return (nodeId: string): Promise<void> => {
    if (scope !== getCompanionReadingScope()) return Promise.reject(new Error('companion_restore_library_changed'));
    const attempt = attempts.get(nodeId) ?? {};
    if (attempt.pending) return attempt.pending;
    attempts.set(nodeId, attempt);
    attempt.pending = restoreAndRefresh(workspaceSync, nodeId, attempt, scope).then(() => {
      attempts.delete(nodeId);
    }).catch((error) => {
      if (!attempt.refresh) attempts.delete(nodeId);
      throw error;
    }).finally(() => { delete attempt.pending; });
    return attempt.pending;
  };
}
