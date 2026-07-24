import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeSyncObjectRecord,
  NativeSyncObjectType,
  NativeSyncStateObjectRecord
} from '../../lib/platform/nativeSyncContract.js';

type JsonSyncObjectType = Exclude<NativeSyncObjectType, 'external_document' | 'import_run' | 'node'>;

interface SyncObjectStateRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: JsonSyncObjectType;
  state_seq?: number;
  updated_at: string;
}

const JSON_SYNC_EXCLUDED_TYPES = new Set(['external_document', 'node']);

const PAYLOAD_SQL_BY_TYPE: Partial<Record<JsonSyncObjectType, string>> = {
  attachment: `SELECT json_object(
    'attachment_id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type,
    'size_bytes', a.size_bytes, 'created_at', a.created_at,
    'blob', json_object(
      'content_hash', b.content_hash, 'storage_key', b.storage_key, 'size_bytes', b.size_bytes,
      'mime_type', b.mime_type, 'availability', b.availability, 'source_device_id', b.source_device_id,
      'created_at', b.created_at, 'cached_at', b.cached_at, 'last_verified_at', b.last_verified_at
    )
  ) AS payload_json
  FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id WHERE a.id = ?`,
  external_folder: `SELECT json_object(
    'id', id, 'folder_path', folder_path, 'attachment_mode', attachment_mode,
    'attachment_root_path', attachment_root_path, 'excluded_dirs_json', excluded_dirs_json,
    'status', status, 'document_count', document_count, 'indexed_at', indexed_at,
    'last_error', last_error, 'owner_installation_id', owner_installation_id,
    'owner_device_name', owner_device_name, 'owner_platform', owner_platform,
    'created_at', created_at, 'updated_at', updated_at
  ) AS payload_json FROM external_search_folders WHERE id = ?`,
  import_source: `SELECT json_object(
    'source_fingerprint', source_fingerprint, 'provider', provider, 'source_kind', source_kind,
    'source_name', source_name, 'source_locator', source_locator, 'first_imported_at', first_imported_at,
    'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint,
    'latest_node_id', latest_node_id
  ) AS payload_json FROM import_sources WHERE source_fingerprint = ?`,
  node_open_state: `SELECT json_object(
    'node_id', node_id, 'last_opened_at', last_opened_at
  ) AS payload_json FROM node_open_state WHERE node_id = ?`,
  node_reading: `SELECT json_object(
    'node_id', node_id, 'interval_duration_ms', interval_duration_ms,
    'interval_growth_factor', interval_growth_factor, 'last_handled_at', last_handled_at,
    'next_at', next_at, 'priority', priority, 'repetition_count', repetition_count, 'state', state
  ) AS payload_json FROM node_reading WHERE node_id = ?`,
  node_review: `SELECT json_object(
    'node_id', node_id, 'due', due, 'last_review_at', last_review_at, 'state', state,
    'stability', stability, 'difficulty', difficulty, 'elapsed_days', elapsed_days,
    'scheduled_days', scheduled_days, 'reps', reps, 'lapses', lapses
  ) AS payload_json FROM node_review WHERE node_id = ?`,
  pdf_page_text: `SELECT json_object(
    'attachment_id', attachment_id, 'page', page, 'text', text,
    'page_width', page_width, 'page_height', page_height
  ) AS payload_json FROM pdf_page_text WHERE attachment_id || ':' || page = ?`,
  setting: `SELECT json_object(
    'key', key, 'scope', scope, 'platform', platform, 'form_factor', form_factor,
    'device_id', device_id, 'value_json', value_json, 'content_hash', content_hash,
    'updated_at', updated_at, 'deleted_at', deleted_at
  ) AS payload_json
  FROM setting_records WHERE scope || ':' || platform || ':' || form_factor || ':' || device_id || ':' || key = ?`
};

function readViewStatePayloadJson(driver: DatabaseDriver, objectId: string) {
  const parts = objectId.split(':');
  const deviceId = parts[3];
  if (!deviceId) return null;
  const key = parts.slice(4).join(':');
  if (key === 'active_node') {
    return driver.queryOne<{ payload_json: string | null }>(
      `SELECT json_object('active_node_id', value, 'updated_at', updated_at) AS payload_json
       FROM workspace_meta WHERE key = 'active_node_id'`
    )?.payload_json ?? null;
  }
  if (key.startsWith('node:')) {
    return driver.queryOne<{ payload_json: string | null }>(
      `SELECT json_object(
         'node_id', node_id, 'scroll_top', scroll_top, 'selection_from', selection_from,
         'selection_to', selection_to, 'source', source, 'updated_at', updated_at
       ) AS payload_json FROM node_view_state WHERE node_id = ? AND device_id = ?`,
      [key.slice(5), deviceId]
    )?.payload_json ?? null;
  }
  return null;
}

function readPayloadJson(driver: DatabaseDriver, type: JsonSyncObjectType, objectId: string) {
  if (type === 'view_state') return readViewStatePayloadJson(driver, objectId);
  const sql = PAYLOAD_SQL_BY_TYPE[type];
  if (!sql) return null;
  return driver.queryOne<{ payload_json: string | null }>(sql, [objectId])?.payload_json ?? null;
}

function toRecord(driver: DatabaseDriver, row: SyncObjectStateRow): NativeSyncObjectRecord {
  return {
    content_hash: row.content_hash,
    deleted_at: row.deleted_at,
    object_id: row.object_id,
    object_type: row.object_type,
    payload_json: row.deleted_at ? null : readPayloadJson(driver, row.object_type, row.object_id),
    updated_at: row.updated_at
  };
}

function toStateRecord(driver: DatabaseDriver, row: SyncObjectStateRow): NativeSyncStateObjectRecord {
  return { ...toRecord(driver, row), state_seq: row.state_seq ?? 0 };
}

export function loadSyncObjectsFromDriver(
  driver: DatabaseDriver,
  objectIds: string[],
  objectTypes?: string[]
) {
  if (objectIds.length === 0) return [];
  const requestedObjectTypes = objectTypes?.filter((type) => !JSON_SYNC_EXCLUDED_TYPES.has(type));
  if (objectTypes?.length && requestedObjectTypes?.length === 0) return [];
  const objectPlaceholders = objectIds.map(() => '?').join(', ');
  const typeFilter = requestedObjectTypes?.length
    ? ` AND object_type IN (${requestedObjectTypes.map(() => '?').join(', ')})`
    : '';
  const rows = driver.queryAll<SyncObjectStateRow>(
    `SELECT object_type, object_id, content_hash, updated_at, deleted_at
     FROM sync_object_state
     WHERE object_type NOT IN ('external_document', 'node')
       AND object_id IN (${objectPlaceholders})${typeFilter}
     ORDER BY updated_at ASC, object_type ASC, object_id ASC`,
    [...objectIds, ...(requestedObjectTypes ?? [])]
  );
  return rows.map((row) => toRecord(driver, row));
}

export function loadSyncStateObjectsSinceFromDriver(driver: DatabaseDriver, cursor: number, limit = 500) {
  const rows = driver.queryAll<Required<SyncObjectStateRow>>(
    `SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at
     FROM sync_object_state
     WHERE object_type NOT IN ('external_document', 'node') AND state_seq > ?
     ORDER BY state_seq ASC LIMIT ?`,
    [Math.max(0, Math.trunc(cursor)), Math.max(1, Math.min(1000, Math.trunc(limit)))]
  );
  return rows.map((row) => toStateRecord(driver, row));
}
