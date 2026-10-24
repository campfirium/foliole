import type { DbPort, DbRow } from './dbPort.js';
import { latestBranchHeadRecords } from './syncNodeApplyRules.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';
import { isNodeVersionIdentityOnly } from './syncNodeVersionHistory.js';
import { ensureSyncSpecialRootNodes } from './syncSpecialRootNodes.js';

export async function assertFramedSyncNodeParentDependencies(
  db: DbPort,
  nodes: readonly SyncNodeRecordMetadata[]
) {
  const currentNodes = latestBranchHeadRecords([...nodes])
    .filter(node => !isNodeVersionIdentityOnly(node) && !node.is_tombstone);
  await ensureSyncSpecialRootNodes(db, currentNodes.flatMap(node => node.snapshot.parent_id
    ? [{ nodeId: node.snapshot.parent_id, referencedAt: node.snapshot.updated_at }] : []));
  const incomingIds = new Set(currentNodes.map((node) => node.object_id));
  const projections = await loadProjections(db, [...incomingIds]);
  const present = await loadPresentNodeIds(db, currentNodes.flatMap(node => node.snapshot.parent_id ? [node.snapshot.parent_id] : []));
  for (const node of currentNodes) {
    if (await retainsCurrentProjection(db, node, projections.get(node.object_id))) continue;
    const parentId = node.snapshot.parent_id;
    if (parentId === node.object_id) throw new Error('framed_sync_node_parent_cycle');
    if (!parentId || incomingIds.has(parentId)) continue;
    if (!present.has(parentId)) throw new Error(`framed_sync_node_parent_missing:${parentId}`);
  }
}

type Projection = { current_version_id: string | null; sync_dirty: number };

async function loadProjections(db: DbPort, nodeIds: readonly string[]) {
  const rows = nodeIds.length ? await db.query<Projection & { id: string }>(`SELECT id, current_version_id, sync_dirty
    FROM nodes WHERE id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]) : [];
  return new Map(rows.map(({ id, ...row }) => [id, row]));
}

async function loadPresentNodeIds(db: DbPort, nodeIds: readonly string[]) {
  const rows = nodeIds.length ? await db.query<DbRow & { id: string }>(
    'SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify([...new Set(nodeIds)])]) : [];
  return new Set(rows.map(row => row.id));
}

async function retainsCurrentProjection(db: DbPort, node: SyncNodeRecordMetadata, current: Projection | undefined) {
  if (!current?.current_version_id || !node.version_id) return false;
  if (node.version_id === current.current_version_id) return true;
  return current.sync_dirty === 0 && await isStoredAncestorVersion(db, node.version_id, current.current_version_id);
}
