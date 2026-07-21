import { randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { backfillMissingNodeSyncState, upsertNodeSyncState } from './nodeSyncStateRows.js';
import {
  buildNodeSyncSnapshot,
  computeNodeSyncVersionHash,
  loadNodeSyncVersionSource
} from './nodeSyncVersionSource.js';

interface SettingsRow extends DatabaseRow {
  value: string;
}

const NODE_SYNC_VERSION_COUNTER_KEY = 'desktop_node_sync_version_counter';
const NODE_SYNC_RESTORE_INCARNATION_KEY = 'desktop_node_sync_restore_incarnation';

function loadNodeSyncRestoreIncarnation() {
  return openDatabaseConnection().driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [
    NODE_SYNC_RESTORE_INCARNATION_KEY
  ])?.value ?? null;
}

export function markNodeSyncRestoreIncarnation(now = new Date().toISOString()) {
  const incarnation = randomUUID();
  openDatabaseConnection().driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [NODE_SYNC_RESTORE_INCARNATION_KEY, incarnation, now]
  );
  return incarnation;
}

function nextNodeSyncVersionId(deviceId: string, now: string) {
  const connection = openDatabaseConnection();
  const currentRow = connection.driver.queryOne<SettingsRow>('SELECT value FROM settings WHERE key = ?', [
    NODE_SYNC_VERSION_COUNTER_KEY
  ]);
  const nextCounter = Number.parseInt(currentRow?.value ?? '0', 10);
  connection.driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    [NODE_SYNC_VERSION_COUNTER_KEY, String(nextCounter + 1), now]
  );
  const incarnation = loadNodeSyncRestoreIncarnation();
  return incarnation ? `${deviceId}#zrestore-${incarnation}#${nextCounter}` : `${deviceId}#${nextCounter}`;
}

function insertNodeSyncVersion(args: {
  contentHash: string;
  deviceId: string;
  nodeId: string;
  now: string;
  parentVersionId: string | null;
  snapshotJson: string;
  versionId: string;
}) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions (
       version_id,
       object_id,
       parent_version_id,
       device_id,
       created_at,
       content_hash,
       snapshot_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      args.versionId,
      args.nodeId,
      args.parentVersionId,
      args.deviceId,
      args.now,
      args.contentHash,
      args.snapshotJson
    ]
  );
}

export function flushNodeSyncVersion(nodeId: string, now = new Date().toISOString()): string | null {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  let createdVersionId: string | null = null;

  connection.driver.transaction(() => {
    const row = loadNodeSyncVersionSource(nodeId);
    if (!row || (row.sync_dirty !== 1 && row.current_version_id)) {
      return;
    }
    const versionId = nextNodeSyncVersionId(deviceId, now);
    const contentHash = computeNodeSyncVersionHash(row, nodeId);
    insertNodeSyncVersion({
      contentHash,
      deviceId,
      nodeId: row.id,
      now,
      parentVersionId: row.current_version_id,
      snapshotJson: JSON.stringify(buildNodeSyncSnapshot(row, nodeId)),
      versionId
    });
    connection.driver.execute(
      `UPDATE nodes
       SET current_version_id = ?, last_modified_by_device_id = ?, sync_dirty = 0
       WHERE id = ?`,
      [versionId, deviceId, row.id]
    );
    upsertNodeSyncState({
      contentHash,
      currentVersionId: versionId,
      deletedAt: row.deleted_at,
      deviceId,
      nodeId: row.id,
      updatedAt: row.updated_at
    }, connection.driver);
    createdVersionId = versionId;
  });

  return createdVersionId;
}

export function flushDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const nodeIds = openDatabaseConnection().driver
    .queryAll<{ id: string }>(
      'SELECT id FROM nodes WHERE sync_dirty = 1 OR current_version_id IS NULL ORDER BY updated_at ASC'
    )
    .map((row) => row.id);

  for (const nodeId of nodeIds) {
    flushNodeSyncVersion(nodeId, now);
  }
  return [...new Set([...nodeIds, ...backfillMissingNodeSyncState(openDatabaseConnection().driver)])];
}
