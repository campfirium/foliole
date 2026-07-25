import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

import { upsertNodeSyncState } from './nodeSyncStateRows.js';
import {
  buildNodeSyncSnapshotFromDriver,
  computeNodeSyncVersionHashFromDriver,
  loadNodeSyncVersionSourceFromDriver
} from './nodeSyncVersionSourceFromDriver.js';

interface SettingsRow extends DatabaseRow { value: string }
const COUNTER_KEY = 'desktop_node_sync_version_counter';
const RESTORE_INCARNATION_KEY = 'desktop_node_sync_restore_incarnation';

export function flushNodeSyncVersionWithDriver(
  driver: DatabaseDriver,
  nodeId: string,
  deviceId: string,
  now = new Date().toISOString()
): string | null {
  let createdVersionId: string | null = null;
  driver.transaction(() => {
    const row = loadNodeSyncVersionSourceFromDriver(driver, nodeId);
    if (!row || (row.sync_dirty !== 1 && row.current_version_id)) return;
    const versionId = nextVersionId(driver, deviceId, now);
    const contentHash = computeNodeSyncVersionHashFromDriver(driver, row, nodeId);
    driver.execute(
      `INSERT INTO node_sync_versions (
         version_id, object_id, parent_version_id, device_id, created_at, content_hash, body_text, snapshot_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [versionId, row.id, row.current_version_id, deviceId, now, contentHash, row.content,
        JSON.stringify(buildNodeSyncSnapshotFromDriver(driver, row, nodeId))]
    );
    if (row.current_version_id) {
      driver.execute(
        `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, 0)`,
        [versionId, row.current_version_id]
      );
    }
    driver.execute(
      `UPDATE nodes SET current_version_id = ?, last_modified_by_device_id = ?, sync_dirty = 0 WHERE id = ?`,
      [versionId, deviceId, row.id]
    );
    upsertNodeSyncState({
      contentHash,
      currentVersionId: versionId,
      deletedAt: row.deleted_at,
      deviceId,
      nodeId: row.id,
      updatedAt: row.updated_at
    }, driver);
    createdVersionId = versionId;
  });
  return createdVersionId;
}

function nextVersionId(driver: DatabaseDriver, deviceId: string, now: string) {
  const current = driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [COUNTER_KEY]);
  const counter = Number.parseInt(current?.value ?? '0', 10);
  driver.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [COUNTER_KEY, String(counter + 1), now]
  );
  const incarnation = driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [
    RESTORE_INCARNATION_KEY
  ])?.value;
  return incarnation ? `${deviceId}#zrestore-${incarnation}#${counter}` : `${deviceId}#${counter}`;
}
