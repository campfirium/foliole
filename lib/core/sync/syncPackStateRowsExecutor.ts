import type { DbPort, DbRow } from './dbPort.js';
import { buildSyncPackApplyableRowsSql, type SyncPackApplyableRowsOptions } from './syncPackApplyStatements.js';

export interface SyncPackStateRowsApplyOptions extends SyncPackApplyableRowsOptions {
  deviceId: string;
  objectTypes?: readonly string[];
}

interface NextSeqRow extends DbRow {
  next_state_seq: number;
}

interface PackStateRow extends DbRow {
  content_hash: string;
  current_version_id: string | null;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  updated_at: string;
}

export async function applySyncPackStateRowsWithDbPort(
  port: DbPort,
  options: SyncPackStateRowsApplyOptions
) {
  const rows = await loadPackStateRows(port, options);
  let nextStateSeq = await loadNextStateSeq(port);
  for (const row of rows) {
    await insertCleanStateRow(port, row, options.deviceId, nextStateSeq);
    nextStateSeq += 1;
  }
  return rows.length;
}

async function loadNextStateSeq(port: DbPort) {
  const rows = await port.query<NextSeqRow>('SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state');
  return rows[0]?.next_state_seq ?? 1;
}

function loadPackStateRows(port: DbPort, options: SyncPackStateRowsApplyOptions) {
  const alias = options.incomingAlias ?? 'inc';
  const objectTypes = options.objectTypes ?? [
    'attachment',
    'external_folder',
    'import_source',
    'node',
    'external_document',
    'node_reading',
    'node_review',
    'pdf_page_text',
    'setting',
    'view_state'
  ];
  if (objectTypes.length === 0) return Promise.resolve([]);
  return port.query<PackStateRow>(
    `SELECT object_type, object_id, content_hash, updated_at, deleted_at, ` +
    `CASE WHEN object_type = 'node' THEN (` +
    `SELECT current_version_id FROM ${alias}.nodes WHERE ${alias}.nodes.id = object_id` +
    `) ELSE NULL END AS current_version_id FROM ${buildSyncPackApplyableRowsSql(options)} ` +
    `WHERE object_type IN (${objectTypes.map(() => '?').join(', ')}) ` +
    `ORDER BY state_seq ASC`,
    objectTypes
  );
}

function insertCleanStateRow(port: DbPort, row: PackStateRow, deviceId: string, stateSeq: number) {
  return port.run(
    `INSERT OR REPLACE INTO sync_object_state (` +
    `object_type, object_id, state_seq, current_version_id, content_hash, ` +
    `last_modified_by_device_id, updated_at, deleted_at, sync_dirty` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      row.object_type,
      row.object_id,
      stateSeq,
      row.current_version_id,
      row.content_hash,
      deviceId,
      row.updated_at,
      row.deleted_at
    ]
  );
}
