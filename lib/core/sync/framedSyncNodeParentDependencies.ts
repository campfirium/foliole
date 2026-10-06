import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';

export async function assertFramedSyncNodeParentDependencies(
  db: DbPort,
  nodes: readonly NativeSyncNodeRecord[]
) {
  const incomingIds = new Set(nodes.map((node) => node.object_id));
  for (const node of nodes) {
    const parentId = node.snapshot.parent_id;
    if (!parentId || incomingIds.has(parentId)) continue;
    const [parent] = await db.query<DbRow>('SELECT 1 AS present FROM nodes WHERE id = ? LIMIT 1',
      [parentId]);
    if (!parent) throw new Error(`framed_sync_node_parent_missing:${parentId}`);
  }
}
