import { canMergeWorkspaceContentProjection, mergeWorkspaceContentProjection } from '../../../../lib/core/database/workspaceContentProjection.js';
import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot.js';
import type { WorkspaceRefreshScope } from '../../../../lib/core/database/workspaceSnapshotRefresh.js';
import { workspaceSnapshotValueEqual } from '../../../../lib/core/database/workspaceSnapshotValueEqual.js';
import type { DbPort } from '../../../../lib/core/sync/dbPort.js';

import { companionWorkspaceSnapshots, registerCompanionWorkspaceRefresh } from './companionWorkspaceSnapshotStore.js';
import { attachOpenCompanionVirtualFolderResults } from './runtime/companionVirtualFolderResults.js';
import { getIosCompanionDatabaseOwner } from './runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionContentProjection } from './sync/workspace-state/companionContentProjection.js';
import { mergeCompanionLocalState } from './sync/workspace-state/companionLocalStateProjection.js';
import { buildIosPersistedNodeViews } from './sync/workspace-state/iosCompanionWorkspaceSnapshotRows.js';
import { loadIosCompanionWorkspaceSnapshot } from './sync/workspace-state/iosCompanionWorkspaceSnapshotStore.js';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

async function readSnapshot(input: { current: WorkspaceSnapshot | null; scope: WorkspaceRefreshScope }) {
  return getIosCompanionDatabaseOwner().readSnapshot(async db => {
    const scoped = input.current && input.scope.kind === 'nodes' && !input.scope.structure
      ? await readScoped(db, input.current, input.scope) : null;
    const next = scoped ?? await loadIosCompanionWorkspaceSnapshot(db);
    return next && attachOpenCompanionVirtualFolderResults(db, next);
  });
}

/** Returns null when the committed scope cannot be proven against this baseline. */
async function readScoped(db: DbPort, current: WorkspaceSnapshot, scope: NodeScope) {
  const reviewed = scope.reviewNodeIds ?? [];
  const reading = scope.readingNodeIds ?? [];
  const roots = new Set([...scope.nodeIds, ...reviewed, ...reading]);
  let next = current;
  if (roots.size) {
    const nodes = await loadCompanionContentProjection(db, [...roots]);
    const expected = Object.values(current.nodesById)
      .filter(node => roots.has(node.id) || (node.parentNodeId !== null && roots.has(node.parentNodeId)))
      .map(node => node.id);
    if (!canMergeWorkspaceContentProjection(current, nodes, expected, reviewed, reading)) return null;
    next = await mergeProjectedNodeViews(db, mergeWorkspaceContentProjection(current, nodes), Object.keys(nodes));
  }
  return mergeCompanionLocalState(db, next, scope);
}

async function mergeProjectedNodeViews(db: DbPort, snapshot: WorkspaceSnapshot, nodeIds: string[]) {
  if (!nodeIds.length) return snapshot;
  // Scroll/selection state cannot change visibility, ordering or the active node.
  // Read it in the same snapshot so a scroll save does not widen a body refresh.
  const rows = await db.query(`SELECT node_id, scroll_top, selection_from, selection_to, source, updated_at
    FROM node_view_state WHERE host_name = (SELECT value FROM companion_meta WHERE key = 'host_name')
      AND node_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]);
  const projected = buildIosPersistedNodeViews(rows);
  if (nodeIds.every(id => workspaceSnapshotValueEqual(snapshot.persistedNodeViewById?.[id], projected[id]))) return snapshot;
  const views = { ...snapshot.persistedNodeViewById };
  for (const id of nodeIds) delete views[id];
  Object.assign(views, projected);
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
