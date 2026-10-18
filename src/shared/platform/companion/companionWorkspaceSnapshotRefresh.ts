import { canMergeWorkspaceContentProjection, mergeWorkspaceContentProjection } from '../../../../lib/core/database/workspaceContentProjection.js';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import type { WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import type { DbPort } from '../../../../lib/core/sync/dbPort.js';

import { companionWorkspaceSnapshots, registerCompanionWorkspaceRefresh } from './companionWorkspaceSnapshotStore.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { buildIosPersistedNodeViews } from './sync/workspace-state/iosCompanionWorkspaceSnapshotRows.js';
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
        return mergeProjectedNodeViews(db, mergeWorkspaceContentProjection(input.current, nodes), Object.keys(nodes));
      }
    }
    return loadIosCompanionWorkspaceSnapshot(db);
  });
}

async function mergeProjectedNodeViews(db: DbPort, snapshot: WorkspaceSnapshot, nodeIds: string[]) {
  if (!nodeIds.length) return snapshot;
  // Scroll/selection state cannot change visibility, ordering or the active node.
  // Read it in the same snapshot so a scroll save does not widen a body refresh.
  const rows = await db.query(`SELECT node_id, scroll_top, selection_from, selection_to, source, updated_at
    FROM node_view_state WHERE host_name = (SELECT value FROM companion_meta WHERE key = 'host_name')
      AND node_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]);
  const views = { ...snapshot.persistedNodeViewById };
  for (const id of nodeIds) delete views[id];
  Object.assign(views, buildIosPersistedNodeViews(rows));
  const next = { ...snapshot };
  if (Object.keys(views).length) next.persistedNodeViewById = views;
  else delete next.persistedNodeViewById;
  return next;
}

export async function refreshCompanionWorkspaceSnapshot(scope?: WorkspaceRefreshScope) {
  if (scope) registerCompanionWorkspaceRefresh(scope);
  if (!companionWorkspaceSnapshots.getSnapshot()) companionWorkspaceSnapshots.register({ kind: 'full' });
  await companionWorkspaceSnapshots.refresh(readSnapshot);
  return companionWorkspaceSnapshots.getSnapshot();
}
