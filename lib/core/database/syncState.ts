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
  | 'readwise_source'
  | 'setting'
  | 'view_state';

export type StateSyncObjectType = Exclude<SyncObjectType, 'import_run'>;
export type SyncStreamName = 'node_versions' | 'review_log' | 'state';

export interface SyncObjectStateInput {
  objectType: StateSyncObjectType;
  objectId: string;
  currentVersionId?: string | null;
  contentHash: string;
  lastModifiedByDeviceId: string;
  updatedAt: string;
  deletedAt?: string | null;
  syncDirty?: boolean;
}

export interface SyncObjectStateRecord extends SyncObjectStateInput {
  stateSeq: number;
  currentVersionId: string | null;
  deletedAt: string | null;
  syncDirty: boolean;
}

interface SyncObjectStateRow extends DatabaseRow {
  object_type: StateSyncObjectType;
  object_id: string;
  state_seq: number;
  current_version_id: string | null;
  content_hash: string;
  last_modified_by_device_id: string;
  updated_at: string;
  deleted_at: string | null;
  sync_dirty: number;
}

interface SyncPeerCursorRow extends DatabaseRow {
  cursor_value: string;
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
  driver.transaction((transactionDriver) => {
    const nextSeq = (transactionDriver.queryOne<{ value: number }>(
      'SELECT COALESCE(MAX(state_seq), 0) + 1 AS value FROM sync_object_state'
    )?.value ?? 1);
    transactionDriver.execute(
      `INSERT INTO sync_object_state (
         object_type,
         object_id,
         state_seq,
         current_version_id,
         content_hash,
         last_modified_by_device_id,
         updated_at,
         deleted_at,
         sync_dirty
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(object_type, object_id) DO UPDATE SET
         state_seq = excluded.state_seq,
         current_version_id = excluded.current_version_id,
         content_hash = excluded.content_hash,
         last_modified_by_device_id = excluded.last_modified_by_device_id,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         sync_dirty = excluded.sync_dirty`,
      [
        input.objectType,
        input.objectId,
        nextSeq,
        input.currentVersionId ?? null,
        input.contentHash,
        input.lastModifiedByDeviceId,
        input.updatedAt,
        input.deletedAt ?? null,
        input.syncDirty ? 1 : 0
      ]
    );
  });
}

function toSyncObjectStateRecord(row: SyncObjectStateRow): SyncObjectStateRecord {
  return {
    objectType: row.object_type,
    objectId: row.object_id,
    stateSeq: row.state_seq,
    currentVersionId: row.current_version_id,
    contentHash: row.content_hash,
    lastModifiedByDeviceId: row.last_modified_by_device_id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncDirty: row.sync_dirty === 1
  };
}

export function selectSyncStateChangesSince(driver: DatabaseDriver, cursor: number, limit = 500): SyncObjectStateRecord[] {
  const rows = driver.queryAll<SyncObjectStateRow>(
    `SELECT
       object_type,
       object_id,
       state_seq,
       current_version_id,
       content_hash,
       last_modified_by_device_id,
       updated_at,
       deleted_at,
       sync_dirty
     FROM sync_object_state
     WHERE state_seq > ?
     ORDER BY state_seq ASC
     LIMIT ?`,
    [Math.max(0, Math.trunc(cursor)), Math.max(1, Math.min(1000, Math.trunc(limit)))]
  );
  return rows.map(toSyncObjectStateRecord);
}

export function getPeerCursor(driver: DatabaseDriver, peerId: string, streamName: SyncStreamName): string | null {
  return driver.queryOne<SyncPeerCursorRow>(
    'SELECT cursor_value FROM sync_peer_cursors WHERE peer_id = ? AND stream_name = ?',
    [peerId, streamName]
  )?.cursor_value ?? null;
}

export function setPeerCursor(
  driver: DatabaseDriver,
  peerId: string,
  streamName: SyncStreamName,
  cursorValue: string,
  updatedAt: string
): void {
  driver.execute(
    `INSERT INTO sync_peer_cursors (peer_id, stream_name, cursor_value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(peer_id, stream_name) DO UPDATE SET
       cursor_value = excluded.cursor_value,
       updated_at = excluded.updated_at`,
    [peerId, streamName, cursorValue, updatedAt]
  );
}
