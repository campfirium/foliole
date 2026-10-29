import type { WorkspaceSnapshot } from '../../../../lib/core/database/workspaceSnapshot';
import { workspaceSnapshotValueEqual } from '../../../../lib/core/database/workspaceSnapshotValueEqual';
import type { DbPort } from '../../../../lib/core/sync/dbPort';

import { buildIosPersistedNodeViews } from './sync/workspace-state/iosCompanionWorkspaceSnapshotRows';

export async function mergeCompanionNodeViews(db: DbPort, snapshot: WorkspaceSnapshot, nodeIds: string[]) {
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
