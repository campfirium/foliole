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
  count: number;
}

export async function applySyncPackStateRowsWithDbPort(
  port: DbPort,
  options: SyncPackStateRowsApplyOptions
) {
  const objectTypes = normalizedObjectTypes(options);
  if (objectTypes.length === 0) return 0;
  const nextStateSeq = await loadNextStateSeq(port);
  await insertCleanStateRows(port, options, objectTypes, nextStateSeq);
  return await loadPackStateRowCount(port, options, objectTypes);
}

async function loadNextStateSeq(port: DbPort) {
  const rows = await port.query<NextSeqRow>('SELECT COALESCE(MAX(state_seq), 0) + 1 AS next_state_seq FROM sync_object_state');
  return rows[0]?.next_state_seq ?? 1;
}

function normalizedObjectTypes(options: SyncPackStateRowsApplyOptions) {
  return options.objectTypes ?? [
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
}

function applyableStateRowsSql(options: SyncPackStateRowsApplyOptions, objectTypes: readonly string[]) {
  return `SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at ` +
    `FROM ${buildSyncPackApplyableRowsSql(options)} ` +
    `WHERE object_type IN (${objectTypes.map(() => '?').join(', ')})`;
}

async function loadPackStateRowCount(port: DbPort, options: SyncPackStateRowsApplyOptions, objectTypes: readonly string[]) {
  const rows = await port.query<PackStateRow>(
    `SELECT COUNT(*) AS count FROM (${applyableStateRowsSql(options, objectTypes)})`,
    objectTypes
  );
  return rows[0]?.count ?? 0;
}

function insertCleanStateRows(
  port: DbPort,
  options: SyncPackStateRowsApplyOptions,
  objectTypes: readonly string[],
  nextStateSeq: number
) {
  const alias = options.incomingAlias ?? 'inc';
  return port.run(
    `WITH applyable AS (${applyableStateRowsSql(options, objectTypes)}), ` +
    `numbered AS (` +
    `SELECT applyable.*, ROW_NUMBER() OVER (ORDER BY state_seq ASC) - 1 AS state_seq_offset, ` +
    `CASE WHEN object_type = 'node' THEN (` +
    `SELECT current_version_id FROM ${alias}.nodes WHERE ${alias}.nodes.id = applyable.object_id` +
    `) ELSE NULL END AS current_version_id FROM applyable) ` +
    `INSERT OR REPLACE INTO sync_object_state (` +
    `object_type, object_id, state_seq, current_version_id, content_hash, ` +
    `last_modified_by_device_id, updated_at, deleted_at, sync_dirty` +
    `) SELECT object_type, object_id, ? + state_seq_offset, current_version_id, content_hash, ` +
    `?, updated_at, deleted_at, 0 FROM numbered`,
    [...objectTypes, nextStateSeq, options.deviceId]
  );
}
