import type { DbPort, DbRow } from './dbPort.js';
import { latestBranchHeadRecords } from './syncNodeApplyRules.js';
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
  for (const node of currentNodes) {
    const parentId = node.snapshot.parent_id;
    if (parentId === node.object_id) throw new Error('framed_sync_node_parent_cycle');
    if (!parentId || incomingIds.has(parentId)) continue;
    const [parent] = await db.query<DbRow>('SELECT 1 AS present FROM nodes WHERE id = ? LIMIT 1',
      [parentId]);
    if (!parent) throw new Error(`framed_sync_node_parent_missing:${parentId}`);
  }
}
