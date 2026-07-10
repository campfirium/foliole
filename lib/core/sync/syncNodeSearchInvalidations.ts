import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';

export interface LocalSyncNodeSearchInvalidationState {
  deleted_at: string | null;
  parent_id: string | null;
  title: string;
}

async function enqueueNodeSearchInvalidation(port: DbPort, type: string, nodeId: string, updatedAt: string) {
  const refreshed = await port.run(
    `UPDATE search_index_invalidations
     SET updated_at = ?, last_error = NULL
     WHERE invalidation_type = ?
       AND target_id = ?
       AND status = 'pending'`,
    [updatedAt, type, nodeId]
  );
  if (refreshed.changes > 0) {
    return;
  }
  await port.run(
    `INSERT INTO search_index_invalidations (
       invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
     ) VALUES (?, ?, 'pending', 0, NULL, ?, ?, NULL, NULL)`,
    [type, nodeId, updatedAt, updatedAt]
  );
}

export async function enqueueAppliedNodeSearchInvalidations(
  port: DbPort,
  localNode: LocalSyncNodeSearchInvalidationState | null,
  record: NativeSyncNodeRecord,
  updatedAt: string
) {
  if (record.snapshot.deleted_at) {
    await enqueueNodeSearchInvalidation(port, 'node_subtree_deleted', record.object_id, updatedAt);
    return;
  }
  if (localNode?.deleted_at) {
    await enqueueNodeSearchInvalidation(port, 'node_subtree_restored', record.object_id, updatedAt);
    return;
  }
  await enqueueNodeSearchInvalidation(port, 'node_workspace', record.object_id, updatedAt);
  if (localNode && (localNode.parent_id !== record.snapshot.parent_id || localNode.title !== record.snapshot.title)) {
    await enqueueNodeSearchInvalidation(port, 'node_subtree_path', record.object_id, updatedAt);
  }
}
