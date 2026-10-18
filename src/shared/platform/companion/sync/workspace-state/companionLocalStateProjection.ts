import type { WorkspaceSnapshot } from '../../../../../../lib/core/database/workspaceSnapshot';
import { resolveWorkspaceSnapshotActiveNodeId } from '../../../../../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceRefreshScope } from '../../../../../../lib/core/database/workspaceSnapshotRefresh';
import { workspaceSnapshotValueEqual } from '../../../../../../lib/core/database/workspaceSnapshotValueEqual';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';
import { isCanonicalVisibleNodeId } from '../../../../workspaceCanonicalSelectors';

type NodeScope = Extract<WorkspaceRefreshScope, { kind: 'nodes' }>;

/**
 * Merges committed open-record and active-node writes into the published
 * baseline. Returns null when a named node is missing or deleted there, so the
 * caller rereads the complete snapshot instead.
 */
export async function mergeCompanionLocalState(
  db: DbPort, snapshot: WorkspaceSnapshot, scope: NodeScope
): Promise<WorkspaceSnapshot | null> {
  let next: WorkspaceSnapshot | null = snapshot;
  if (scope.openStateNodeIds?.length) next = await mergeOpenStates(db, next, scope.openStateNodeIds);
  if (next && scope.activeNode) next = await mergeActiveNode(db, next);
  return next;
}

async function mergeOpenStates(db: DbPort, snapshot: WorkspaceSnapshot, nodeIds: readonly string[]) {
  if (nodeIds.some(id => !isCanonicalVisibleNodeId(snapshot, id))) return null;
  const rows = await db.query(`SELECT node_id, last_opened_at FROM node_open_state
    WHERE node_id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]);
  const projected = Object.fromEntries(rows.flatMap(row =>
    typeof row.node_id === 'string' && typeof row.last_opened_at === 'string'
      ? [[row.node_id, { lastOpenedAt: row.last_opened_at, nodeId: row.node_id }]] : []));
  const current = snapshot.nodeOpenStateById ?? {};
  if (nodeIds.every(id => workspaceSnapshotValueEqual(current[id], projected[id]))) return snapshot;
  const states = { ...current };
  for (const id of nodeIds) delete states[id];
  Object.assign(states, projected);
  const next = { ...snapshot };
  if (Object.keys(states).length) next.nodeOpenStateById = states;
  else delete next.nodeOpenStateById;
  return next;
}

async function mergeActiveNode(db: DbPort, snapshot: WorkspaceSnapshot) {
  const [row] = await db.query("SELECT value FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1");
  const stored = typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : null;
  if (stored && !isCanonicalVisibleNodeId(snapshot, stored)) return null;
  const activeNodeId = resolveWorkspaceSnapshotActiveNodeId({
    activeNodeId: stored, nodeOrder: snapshot.nodeOrder, nodesById: snapshot.nodesById
  });
  if (stored && activeNodeId !== stored) return null;
  return activeNodeId === snapshot.activeNodeId ? snapshot : { ...snapshot, activeNodeId };
}
