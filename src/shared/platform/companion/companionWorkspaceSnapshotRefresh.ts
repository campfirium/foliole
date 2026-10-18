import { canMergeWorkspaceContentProjection, mergeWorkspaceContentProjection } from '../../../../lib/core/database/workspaceContentProjection.js';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import type { WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';

import { companionWorkspaceSnapshots, registerCompanionWorkspaceRefresh } from './companionWorkspaceSnapshotStore.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

async function readSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  return getIosCompanionDatabaseOwner().readSnapshot(async db => {
    if (input.current && input.scope.kind === 'nodes') {
      const roots = new Set(input.scope.nodeIds);
      const nodes: WorkspaceSnapshot['nodesById'] = {};
      for (const id of roots) Object.assign(nodes, await loadCompanionContentProjection(db, id));
      const expected = Object.values(input.current.nodesById)
        .filter(node => roots.has(node.id) || (node.parentNodeId !== null && roots.has(node.parentNodeId)))
        .map(node => node.id);
      if (canMergeWorkspaceContentProjection(input.current, nodes, expected)) {
        return mergeWorkspaceContentProjection(input.current, nodes);
      }
    }
    return loadIosCompanionWorkspaceSnapshot(db);
  });
}


export async function refreshCompanionWorkspaceSnapshot(scope?: WorkspaceRefreshScope) {
  if (scope) registerCompanionWorkspaceRefresh(scope);
  if (!companionWorkspaceSnapshots.getSnapshot()) companionWorkspaceSnapshots.register({ kind: 'full' });
  await companionWorkspaceSnapshots.refresh(readSnapshot);
  return companionWorkspaceSnapshots.getSnapshot();
}
