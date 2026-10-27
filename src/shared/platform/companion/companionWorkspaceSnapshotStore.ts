import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import { WorkspaceSnapshotRefresh, type WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';

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
    scope.openStateNodeIds?.length || scope.activeNode) companionWorkspaceSnapshots.register(scope);
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
