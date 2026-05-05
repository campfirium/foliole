import type { DbPort, DbRow } from './dbPort.js';
import { buildSyncPackApplyableRowsSql, type SyncPackApplyableRowsOptions } from './syncPackApplyStatements.js';

export interface SyncPackSyncObjectsOptions extends SyncPackApplyableRowsOptions {
  deviceId: string;
}

export interface SyncPackSyncObjectRecord {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  payload_json: string | null;
  updated_at: string;
}

interface SyncPackSyncObjectRow extends DbRow, SyncPackSyncObjectRecord {}

export function isConsumableSyncPackSyncObject(record: Pick<SyncPackSyncObjectRecord, 'object_id' | 'object_type'>, deviceId: string) {
  if (record.object_type !== 'view_state') return true;
  const parts = record.object_id.split(':', 5);
  return parts.length === 5 && parts[1] === 'android' && parts[3] === deviceId;
}

export async function loadSyncPackSyncObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const rows = await port.query<SyncPackSyncObjectRow>(buildSyncPackSyncObjectsQuery(options));
  return rows.filter((row) => isConsumableSyncPackSyncObject(row, options.deviceId));
}

function buildSyncPackSyncObjectsQuery(options: SyncPackSyncObjectsOptions) {
  const alias = options.incomingAlias ?? 'inc';
  return `SELECT object_type, object_id, content_hash, payload_json, updated_at, deleted_at ` +
    `FROM ${alias}.sync_objects incoming ` +
    `WHERE EXISTS (` +
    `SELECT 1 FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias })} state ` +
    `WHERE state.object_type = incoming.object_type AND state.object_id = incoming.object_id` +
    `) ORDER BY updated_at ASC, object_type ASC, object_id ASC`;
}
