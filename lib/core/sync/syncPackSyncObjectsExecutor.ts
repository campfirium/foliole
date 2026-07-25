import type { DbPort, DbRow } from './dbPort.js';
import { applySyncObjectPayloadWithDbPort } from './syncObjectPayloadExecutor.js';
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
  return isLocalAndroidViewStateObject(record.object_id, deviceId);
}

export function isLocalAndroidViewStateObject(objectId: string, deviceId?: string) {
  if (!deviceId) return false;
  const parts = objectId.split(':', 5);
  return parts.length === 5 && parts[1] === 'android' && parts[3] === deviceId;
}

export async function loadSyncPackSyncObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const rows = await port.query<SyncPackSyncObjectRow>(buildSyncPackSyncObjectsQuery(options));
  return rows.filter((row) => isConsumableSyncPackSyncObject(row, options.deviceId));
}

export async function applySyncPackSettingObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'setting');
  for (const record of records) {
    await applySyncObjectPayloadWithDbPort(port, record);
  }
  return records.length;
}

export async function applySyncPackMetadataObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'import_source' || record.object_type === 'external_folder');
  for (const record of records) {
    await applySyncObjectPayloadWithDbPort(port, record);
  }
  return records.length;
}

export async function applySyncPackNodeTextAlternativesWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'node_text_alternative');
  for (const record of records) await applySyncObjectPayloadWithDbPort(port, record);
  return records.length;
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
