import { topicAlternativeDeletionHash } from '../sync/topicAlternativeApply.js';

import type { DatabaseDriver } from './driver.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export function recordNodeRelatedStateDeletion(driver: DatabaseDriver, nodeId: string, deletedAt: string) {
  for (const row of driver.queryAll<{ alternative_id: string }>(
    'SELECT alternative_id FROM node_text_alternatives WHERE node_id = ?', [nodeId])) {
    upsertSyncObjectState(driver, { objectType: 'node_text_alternative', objectId: row.alternative_id,
      deletedAt, updatedAt: deletedAt, lastModifiedByHostName: requireDatabaseHostName(driver), syncDirty: true,
      contentHash: topicAlternativeDeletionHash(row.alternative_id, deletedAt) });
  }
  const type = 'node_reading';
  const existing = driver.queryOne(`SELECT 1 FROM node_reading WHERE node_id = ?
    UNION SELECT 1 FROM sync_object_state WHERE object_type = ? AND object_id = ? AND deleted_at IS NULL`,
  [nodeId, type, nodeId]);
  if (!existing) return;
  upsertSyncObjectState(driver, {
    objectType: type, objectId: nodeId, deletedAt, updatedAt: deletedAt,
    lastModifiedByHostName: requireDatabaseHostName(driver), syncDirty: true,
    contentHash: computeSyncContentHash(type, { deleted_at: deletedAt, node_id: nodeId, object_type: type })
  });
}

export function retireUnversionedDeletedNodeState(driver: DatabaseDriver, nodeId: string) {
  driver.execute(`DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = ?
    AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE object_id = ?)
    AND NOT EXISTS (SELECT 1 FROM node_sync_tombstones WHERE node_id = ?)`, [nodeId, nodeId, nodeId]);
}
