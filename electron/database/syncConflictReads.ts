import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';

interface SyncConflictRow extends DatabaseRow {
  conflict_version_id: string;
  content_hash: string | null;
  detected_at: string;
  device_id: string | null;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
}

function parseSnapshot(snapshotJson: string): NativeSyncNodeConflictRecord['snapshot'] {
  return JSON.parse(snapshotJson) as NativeSyncNodeConflictRecord['snapshot'];
}

function toNativeSyncNodeConflictRecord(row: SyncConflictRow): NativeSyncNodeConflictRecord {
  const snapshot = parseSnapshot(row.snapshot_json);
  return {
    conflict_version_id: row.conflict_version_id,
    content_hash: row.content_hash,
    detected_at: row.detected_at,
    device_id: row.device_id,
    object_id: row.object_id,
    parent_version_id: row.parent_version_id,
    snapshot,
    updated_at: snapshot.updated_at
  };
}

export function loadSyncNodeConflicts(objectIds?: string[]) {
  const connection = openDatabaseConnection();
  const hasObjectFilter = Array.isArray(objectIds) && objectIds.length > 0;
  const placeholders = hasObjectFilter ? objectIds.map(() => '?').join(', ') : '';
  const rows = connection.driver.queryAll<SyncConflictRow>(
    `SELECT
       conflict_version_id,
       object_id,
       parent_version_id,
       device_id,
       content_hash,
       snapshot_json,
       detected_at
     FROM node_sync_conflicts
     ${hasObjectFilter ? `WHERE object_id IN (${placeholders})` : ''}
     ORDER BY detected_at DESC, object_id ASC`,
    hasObjectFilter ? objectIds : []
  );

  return rows.map((row) => toNativeSyncNodeConflictRecord(row));
}
