import type { DbPort, DbRow } from './dbPort.js';
import { asObject, integer, text } from './syncObjectPayloadValues.js';
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

export async function applySyncPackSettingObjectsWithDbPort(
  port: DbPort,
  options: SyncPackSyncObjectsOptions
) {
  const records = (await loadSyncPackSyncObjectsWithDbPort(port, options))
    .filter((record) => record.object_type === 'setting');
  for (const record of records) {
    await applySettingObject(port, record);
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
    if (record.object_type === 'import_source') {
      await applyImportSourceObject(port, record);
    } else {
      await applyExternalFolderObject(port, record);
    }
  }
  return records.length;
}

async function applySettingObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    const parts = record.object_id.split(':', 5);
    await port.run(
      `DELETE FROM setting_records ` +
      `WHERE scope = ? AND platform = ? AND form_factor = ? AND device_id = ? AND key = ?`,
      [
        parts[0] ?? 'device',
        parts[1] ?? '*',
        parts[2] ?? '*',
        parts[3] ?? '*',
        parts[4] ?? record.object_id
      ]
    );
    return;
  }
  const payload = asObject(record);
  const parts = record.object_id.split(':', 5);
  await port.run(
    `INSERT INTO setting_records (` +
    `scope, platform, form_factor, device_id, key, value_json, content_hash, updated_at, deleted_at` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(key, scope, platform, form_factor, device_id) DO UPDATE SET ` +
    `value_json = excluded.value_json, content_hash = excluded.content_hash, ` +
    `updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
    [
      text(payload.scope) ?? parts[0] ?? 'device',
      text(payload.platform) ?? parts[1] ?? '*',
      text(payload.form_factor) ?? parts[2] ?? '*',
      text(payload.device_id) ?? parts[3] ?? '*',
      text(payload.key) ?? parts[4] ?? record.object_id,
      text(payload.value_json) ?? 'null',
      record.content_hash,
      record.updated_at,
      null
    ]
  );
}

async function applyImportSourceObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM import_sources WHERE source_fingerprint = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO import_sources (` +
    `source_fingerprint, provider, source_kind, source_name, source_locator, ` +
    `first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(source_fingerprint) DO UPDATE SET ` +
    `provider = excluded.provider, source_kind = excluded.source_kind, source_name = excluded.source_name, ` +
    `source_locator = excluded.source_locator, last_imported_at = excluded.last_imported_at, ` +
    `last_content_fingerprint = excluded.last_content_fingerprint, latest_node_id = excluded.latest_node_id`,
    [
      record.object_id,
      text(payload.provider) ?? 'unknown',
      text(payload.source_kind) ?? 'unknown',
      text(payload.source_name) ?? record.object_id,
      text(payload.source_locator) ?? record.object_id,
      text(payload.first_imported_at) ?? record.updated_at,
      text(payload.last_imported_at) ?? record.updated_at,
      text(payload.last_content_fingerprint) ?? record.content_hash,
      text(payload.latest_node_id)
    ]
  );
}

async function applyExternalFolderObject(port: DbPort, record: SyncPackSyncObjectRecord) {
  if (record.deleted_at) {
    await port.run('DELETE FROM external_search_folders WHERE id = ?', [record.object_id]);
    return;
  }
  const payload = asObject(record);
  await port.run(
    `INSERT INTO external_search_folders (` +
    `id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json, status, ` +
    `document_count, indexed_at, last_error, created_at, updated_at` +
    `) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ` +
    `ON CONFLICT(id) DO UPDATE SET ` +
    `folder_path = excluded.folder_path, attachment_mode = excluded.attachment_mode, ` +
    `attachment_root_path = excluded.attachment_root_path, excluded_dirs_json = excluded.excluded_dirs_json, ` +
    `status = excluded.status, document_count = excluded.document_count, indexed_at = excluded.indexed_at, ` +
    `last_error = excluded.last_error, updated_at = excluded.updated_at`,
    [
      record.object_id,
      text(payload.folder_path) ?? '',
      text(payload.attachment_mode) ?? 'document_relative_first_then_fixed_root',
      text(payload.attachment_root_path),
      text(payload.excluded_dirs_json) ?? '[]',
      text(payload.status) ?? 'idle',
      integer(payload.document_count),
      text(payload.indexed_at),
      text(payload.last_error),
      text(payload.created_at) ?? record.updated_at,
      record.updated_at
    ]
  );
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
