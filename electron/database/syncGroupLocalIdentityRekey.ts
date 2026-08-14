import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

interface VersionRow extends DatabaseRow {
  body_text: string | null;
  content_hash: string;
  created_at: string;
  device_id: string;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

interface ParentRow extends DatabaseRow {
  ordinal: number;
  parent_version_id: string;
  version_id: string;
}

export function rekeyLocalSyncHistory(
  driver: DatabaseDriver,
  previousDeviceId: string,
  assignedDeviceId: string
) {
  const from = previousDeviceId.trim();
  const to = assignedDeviceId.trim();
  if (!from || !to) throw new Error('sync_group_local_identity_invalid');
  if (from === to) return { rekeyedVersionCount: 0 };
  if (driver.queryOne('SELECT 1 AS present FROM sync_group_local_state LIMIT 1')) {
    throw new Error('sync_group_identity_mismatch');
  }
  return driver.transaction(() => rekeyHistoryInTransaction(driver, from, to));
}

function rekeyHistoryInTransaction(driver: DatabaseDriver, from: string, to: string) {
  const versions = driver.queryAll<VersionRow>(
    `SELECT version_id, object_id, parent_version_id, device_id, created_at,
            content_hash, body_text, snapshot_json
     FROM node_sync_versions WHERE device_id = ? ORDER BY created_at, version_id`,
    [from]
  );
  const versionIds = new Map(versions.map((row) => [row.version_id, rekeyVersionId(row.version_id, from, to)]));
  assertTargetsAvailable(driver, [...versionIds.values()], 'node_sync_versions', 'version_id');
  const parents = driver.queryAll<ParentRow>(
    'SELECT version_id, parent_version_id, ordinal FROM node_sync_version_parents'
  ).filter((row) => versionIds.has(row.version_id) || versionIds.has(row.parent_version_id));

  for (const row of versions) insertRekeyedVersion(driver, row, versionIds, to);
  for (const oldId of versionIds.keys()) {
    driver.execute('DELETE FROM node_sync_version_parents WHERE version_id = ? OR parent_version_id = ?', [oldId, oldId]);
  }
  rekeyVersionReferences(driver, versionIds);
  for (const oldId of versionIds.keys()) driver.execute('DELETE FROM node_sync_versions WHERE version_id = ?', [oldId]);
  for (const row of parents) {
    driver.execute(
      'INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal) VALUES (?, ?, ?)',
      [versionIds.get(row.version_id) ?? row.version_id,
        versionIds.get(row.parent_version_id) ?? row.parent_version_id, row.ordinal]
    );
  }
  rekeyStandaloneVersionFacts(driver, from, to);
  rekeyDeviceAttribution(driver, from, to);
  driver.execute(
    `UPDATE settings SET value = ?
     WHERE key IN ('device_id', 'desktop_device_id', 'device_identity_reset_pending') AND value IN (?, ?)`,
    [JSON.stringify(to), JSON.stringify(from), from]
  );
  return { rekeyedVersionCount: versions.length };
}

function insertRekeyedVersion(
  driver: DatabaseDriver,
  row: VersionRow,
  ids: Map<string, string>,
  deviceId: string
) {
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, body_text, snapshot_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ids.get(row.version_id)!, row.object_id, row.parent_version_id ? ids.get(row.parent_version_id) ?? row.parent_version_id : null,
      deviceId, row.created_at, row.content_hash, row.body_text, row.snapshot_json]
  );
}

function rekeyVersionReferences(driver: DatabaseDriver, ids: Map<string, string>) {
  const references = [
    ['nodes', 'current_version_id'],
    ['sync_object_state', 'current_version_id'],
    ['sync_change_log', 'base_version_id'],
    ['sync_change_log', 'result_version_id'],
    ['node_sync_versions', 'parent_version_id'],
    ['node_sync_conflicts', 'parent_version_id'],
    ['node_text_alternatives', 'source_version_id']
  ] as const;
  for (const [table, column] of references) {
    for (const [oldId, newId] of ids) driver.execute(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newId, oldId]);
  }
}

function rekeyStandaloneVersionFacts(driver: DatabaseDriver, from: string, to: string) {
  const tombstones = driver.queryAll<{ node_id: string; version_id: string }>(
    'SELECT node_id, version_id FROM node_sync_tombstones WHERE device_id = ?', [from]
  );
  for (const row of tombstones) {
    driver.execute('UPDATE node_sync_tombstones SET version_id = ? WHERE node_id = ?',
      [rekeyVersionId(row.version_id, from, to), row.node_id]);
  }
  const conflicts = driver.queryAll<{ conflict_version_id: string }>(
    'SELECT conflict_version_id FROM node_sync_conflicts WHERE device_id = ?', [from]
  );
  const targets = conflicts.map((row) => rekeyVersionId(row.conflict_version_id, from, to));
  assertTargetsAvailable(driver, targets, 'node_sync_conflicts', 'conflict_version_id');
  conflicts.forEach((row, index) => driver.execute(
    'UPDATE node_sync_conflicts SET conflict_version_id = ? WHERE conflict_version_id = ?',
    [targets[index]!, row.conflict_version_id]
  ));
}

function rekeyDeviceAttribution(driver: DatabaseDriver, from: string, to: string) {
  const columns = [
    ['nodes', 'last_modified_by_device_id'], ['sync_object_state', 'last_modified_by_device_id'],
    ['sync_change_log', 'device_id'], ['node_sync_tombstones', 'device_id'],
    ['node_sync_conflicts', 'device_id'], ['node_text_alternatives', 'source_device_id'],
    ['review_log', 'device_id'], ['node_reading_device_state', 'device_id'],
    ['attachment_blobs', 'source_device_id'], ['content_blobs', 'source_device_id']
  ] as const;
  for (const [table, column] of columns) driver.execute(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [to, from]);
}

function rekeyVersionId(versionId: string, from: string, to: string) {
  if (!versionId.startsWith(`${from}#`)) throw new Error(`sync_group_local_version_identity_invalid:${versionId}`);
  return `${to}${versionId.slice(from.length)}`;
}

function assertTargetsAvailable(driver: DatabaseDriver, values: string[], table: string, column: string) {
  for (const value of values) {
    if (driver.queryOne(`SELECT 1 AS present FROM ${table} WHERE ${column} = ? LIMIT 1`, [value])) {
      throw new Error(`sync_group_local_identity_target_conflict:${value}`);
    }
  }
}
