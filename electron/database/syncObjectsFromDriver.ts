import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
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

function readViewStatePayloadJson(driver: DatabaseDriver, objectId: string) {
  const parts = objectId.split(':');
  const hostName = parts[3];
  if (!hostName) return null;
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
       ) AS payload_json FROM node_view_state WHERE node_id = ? AND host_name = ?`,
      [key.slice(5), hostName]
    )?.payload_json ?? null;
  }
  return null;
}

function readPayloadJson(driver: DatabaseDriver, type: JsonSyncObjectType, objectId: string) {
  if (type === 'view_state') return readViewStatePayloadJson(driver, objectId);
  const sql = SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[type as keyof typeof SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE];
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
