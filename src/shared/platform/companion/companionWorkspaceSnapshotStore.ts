import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import { WorkspaceSnapshotRefresh, type WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import type { DbPort } from '../../../../lib/core/sync/dbPort.js';

import { subscribeCompanionReadingScope } from './reading/companionReadingScope.js';

let syncRunHolds = 0;
let heldSyncScopes: WorkspaceRefreshScope[] = [];

export const companionWorkspaceSnapshots = new WorkspaceSnapshotRefresh<WorkspaceSnapshot | null>(null);
subscribeCompanionReadingScope(() => {
  heldSyncScopes = [];
  companionWorkspaceSnapshots.reset(null);
});

export function registerCompanionWorkspaceRefresh(scope: WorkspaceRefreshScope) {
  if (scope.kind === 'full' || scope.nodeIds.length || scope.reviewNodeIds?.length || scope.readingNodeIds?.length ||
    scope.openStateNodeIds?.length || scope.activeNode || scope.structure) companionWorkspaceSnapshots.register(scope);
}

/**
 * Notes a sync run applies are read once when the run lets go. Otherwise any refresh started meanwhile,
 * such as one after an edit, keeps rereading the workspace for each note the run applies.
 */
export function registerCompanionSyncAppliedRefresh(scope: WorkspaceRefreshScope) {
  if (syncRunHolds > 0) heldSyncScopes.push(scope);
  else registerCompanionWorkspaceRefresh(scope);
}

export function holdCompanionSyncAppliedRefresh() {
  syncRunHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    syncRunHolds -= 1;
    if (syncRunHolds > 0) return;
    const scopes = heldSyncScopes;
    heldSyncScopes = [];
    scopes.forEach(registerCompanionWorkspaceRefresh);
  };
}

type CommittedWorkspaceListener = (scope: WorkspaceRefreshScope, db?: DbPort) => Promise<void>;
const committedListeners = new Set<CommittedWorkspaceListener>();

export function subscribeCommittedCompanionWorkspace(listener: CommittedWorkspaceListener) {
  committedListeners.add(listener);
  return () => { committedListeners.delete(listener); };
}

export async function updateCommittedCompanionWorkspace(scope: WorkspaceRefreshScope, db?: DbPort) {
  for (const listener of committedListeners) {
    try { await listener(scope, db); }
    catch { /* The owner marks its index unavailable; a committed write still succeeded. */ }
  }
}

type PreparedWorkspaceListener = (source: object, snapshot: WorkspaceSnapshot, revision: number) => Promise<void>;
const preparedListeners = new Set<PreparedWorkspaceListener>();

export function subscribePreparedCompanionWorkspace(listener: PreparedWorkspaceListener) {
  preparedListeners.add(listener);
  return () => { preparedListeners.delete(listener); };
}

export async function prepareCompanionWorkspaceIndex(source: object, snapshot: WorkspaceSnapshot, revision: number) {
  for (const listener of preparedListeners) await listener(source, snapshot, revision);
}
