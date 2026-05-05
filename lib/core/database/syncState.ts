import { createHash } from 'node:crypto';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import type { NodeSyncHashInput } from './nodeSyncHash.js';
import { computeNodeSyncHash } from './nodeSyncHash.js';

export type SyncObjectType =
  | 'attachment'
  | 'external_document'
  | 'external_folder'
  | 'import_run'
  | 'import_source'
  | 'node'
  | 'node_reading'
  | 'node_review'
  | 'pdf_page_text'
  | 'setting'
  | 'view_state';

export type SyncChangeType = 'delete' | 'link' | 'touch' | 'unlink' | 'upsert';

export interface SyncObjectStateInput {
  objectType: SyncObjectType;
  objectId: string;
  currentVersionId?: string | null;
  contentHash: string;
  lastModifiedByDeviceId: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncDirty?: boolean;
}

export interface SyncChangeLogInput {
  changeId: string;
  objectType: SyncObjectType;
  objectId: string;
  changeType: SyncChangeType;
  deviceId: string;
  baseVersionId?: string | null;
  resultVersionId?: string | null;
  contentHash: string;
  payloadJson: string;
  createdAt: string;
  appliedAt?: string | null;
}

export interface SyncChangeCursor {
  createdAt: string;
  changeId: string;
}

export interface SyncChangeLogRecord extends SyncChangeLogInput {
  baseVersionId: string | null;
  resultVersionId: string | null;
  appliedAt: string | null;
}

interface SyncChangeLogRow extends DatabaseRow {
  change_id: string;
  object_type: SyncObjectType;
  object_id: string;
  change_type: SyncChangeType;
  device_id: string;
  base_version_id: string | null;
  result_version_id: string | null;
  content_hash: string;
  payload_json: string;
  created_at: string;
  applied_at: string | null;
}

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue | undefined };

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue as JsonValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeSyncContentHash(objectType: SyncObjectType, payload: JsonValue | NodeSyncHashInput): string {
  if (objectType === 'node') {
    return computeNodeSyncHash(payload as NodeSyncHashInput);
  }
  return createHash('sha256').update(stableJson(payload as JsonValue)).digest('hex');
}

export function upsertSyncObjectState(driver: DatabaseDriver, input: SyncObjectStateInput): void {
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type,
       object_id,
       current_version_id,
       content_hash,
       last_modified_by_device_id,
       updated_at,
       deleted_at,
       sync_dirty
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(object_type, object_id) DO UPDATE SET
       current_version_id = excluded.current_version_id,
       content_hash = excluded.content_hash,
       last_modified_by_device_id = excluded.last_modified_by_device_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       sync_dirty = excluded.sync_dirty`,
    [
      input.objectType,
      input.objectId,
      input.currentVersionId ?? null,
      input.contentHash,
      input.lastModifiedByDeviceId,
      input.updatedAt,
      input.deletedAt ?? null,
      input.syncDirty ? 1 : 0
    ]
  );
}

export function appendSyncChangeLog(driver: DatabaseDriver, input: SyncChangeLogInput): void {
  driver.execute(
    `INSERT INTO sync_change_log (
       change_id,
       object_type,
       object_id,
       change_type,
       device_id,
       base_version_id,
       result_version_id,
       content_hash,
       payload_json,
       created_at,
       applied_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.changeId,
      input.objectType,
      input.objectId,
      input.changeType,
      input.deviceId,
      input.baseVersionId ?? null,
      input.resultVersionId ?? null,
      input.contentHash,
      input.payloadJson,
      input.createdAt,
      input.appliedAt ?? null
    ]
  );
}

function toSyncChangeLogRecord(row: SyncChangeLogRow): SyncChangeLogRecord {
  return {
    changeId: row.change_id,
    objectType: row.object_type,
    objectId: row.object_id,
    changeType: row.change_type,
    deviceId: row.device_id,
    baseVersionId: row.base_version_id,
    resultVersionId: row.result_version_id,
    contentHash: row.content_hash,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    appliedAt: row.applied_at
  };
}

export function listSyncChangesAfterCursor(
  driver: DatabaseDriver,
  cursor: SyncChangeCursor | null,
  limit = 500
): SyncChangeLogRecord[] {
  const rows = cursor
    ? driver.queryAll<SyncChangeLogRow>(
        `SELECT
           change_id,
           object_type,
           object_id,
           change_type,
           device_id,
           base_version_id,
           result_version_id,
           content_hash,
           payload_json,
           created_at,
           applied_at
         FROM sync_change_log
         WHERE created_at > ? OR (created_at = ? AND change_id > ?)
         ORDER BY created_at ASC, change_id ASC
         LIMIT ?`,
        [cursor.createdAt, cursor.createdAt, cursor.changeId, limit]
      )
    : driver.queryAll<SyncChangeLogRow>(
        `SELECT
           change_id,
           object_type,
           object_id,
           change_type,
           device_id,
           base_version_id,
           result_version_id,
           content_hash,
           payload_json,
           created_at,
           applied_at
         FROM sync_change_log
         ORDER BY created_at ASC, change_id ASC
         LIMIT ?`,
        [limit]
      );

  return rows.map(toSyncChangeLogRecord);
}
