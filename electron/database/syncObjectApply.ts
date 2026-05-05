import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { applySyncObjectsWithDbPort } from '../../lib/core/sync/syncObjectApplyExecutor.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { openDatabaseConnection } from './connection.js';
import { applySyncObjectPayload } from './syncObjectApplyPayloads.js';

const REMOTE_DEVICE_ID = 'sync-remote';
const STATE_OBJECT_TYPES = new Set<NativeSyncObjectRecord['object_type']>([
  'attachment',
  'external_document',
  'external_folder',
  'import_source',
  'node_reading',
  'node_review',
  'pdf_page_text',
  'setting',
  'view_state'
]);

interface ExistingSyncObjectState extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  updated_at: string;
}

type SyncObjectApplyStatus = 'apply' | 'already_applied' | 'stale';

interface ApplySyncObjectsOptions {
  includeAlreadyApplied?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(raw: Record<string, unknown>, key: keyof NativeSyncObjectRecord) {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid sync object ${key}`);
  }
  return value;
}

function readDeletedAt(raw: Record<string, unknown>) {
  if (!Object.hasOwn(raw, 'deleted_at')) {
    throw new Error('Invalid sync object deleted_at');
  }
  const value = raw.deleted_at;
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Invalid sync object deleted_at');
  }
  return value;
}

function readPayloadJson(raw: Record<string, unknown>, deletedAt: string | null) {
  if (!Object.hasOwn(raw, 'payload_json')) {
    throw new Error('Invalid sync object payload_json');
  }
  const value = raw.payload_json;
  if (value === null) {
    if (deletedAt === null) {
      throw new Error('Invalid sync object payload_json');
    }
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Invalid sync object payload_json');
  }
  return value;
}

function validateSyncObjectRecord(value: unknown): NativeSyncObjectRecord {
  if (!isRecord(value)) {
    throw new Error('Invalid sync object record');
  }
  const objectType = requireString(value, 'object_type') as NativeSyncObjectRecord['object_type'];
  if (!STATE_OBJECT_TYPES.has(objectType)) {
    throw new Error(`Unsupported sync object type: ${objectType}`);
  }
  const deletedAt = readDeletedAt(value);
  return {
    content_hash: requireString(value, 'content_hash'),
    deleted_at: deletedAt,
    object_id: requireString(value, 'object_id'),
    object_type: objectType,
    payload_json: readPayloadJson(value, deletedAt),
    updated_at: requireString(value, 'updated_at')
  };
}

function getSyncObjectApplyStatus(driver: DatabaseDriver, record: NativeSyncObjectRecord): SyncObjectApplyStatus {
  const current = driver.queryOne<ExistingSyncObjectState>(
    'SELECT content_hash, deleted_at, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    [record.object_type, record.object_id]
  );
  if (!current) {
    return 'apply';
  }
  if (current.content_hash === record.content_hash && current.deleted_at === record.deleted_at) {
    return 'already_applied';
  }
  return current.updated_at <= record.updated_at ? 'apply' : 'stale';
}

function warnSkippedSyncObject(record: unknown, reason: unknown) {
  const raw = isRecord(record) ? record : {};
  console.warn('[sync] skipped remote state object', {
    objectId: typeof raw.object_id === 'string' ? raw.object_id : null,
    objectType: typeof raw.object_type === 'string' ? raw.object_type : null,
    reason: reason instanceof Error ? reason.message : String(reason)
  });
}

function applySingleSyncObject(driver: DatabaseDriver, record: NativeSyncObjectRecord, options: ApplySyncObjectsOptions) {
  return driver.transaction((transactionDriver) => {
    const status = getSyncObjectApplyStatus(transactionDriver, record);
    if (status === 'already_applied') {
      return options.includeAlreadyApplied ? `${record.object_type}:${record.object_id}` : null;
    }
    if (status === 'stale') {
      return null;
    }
    applySyncObjectPayload(transactionDriver, record);
    upsertSyncObjectState(transactionDriver, {
      objectType: record.object_type,
      objectId: record.object_id,
      contentHash: record.content_hash,
      deletedAt: record.deleted_at,
      lastModifiedByDeviceId: REMOTE_DEVICE_ID,
      updatedAt: record.updated_at,
      syncDirty: false
    });
    return `${record.object_type}:${record.object_id}`;
  });
}

export function applySyncObjects(records: NativeSyncObjectRecord[], options: ApplySyncObjectsOptions = {}) {
  if (records.length === 0) return [];
  const connection = openDatabaseConnection();
  const appliedIds: string[] = [];

  for (const record of records) {
    try {
      const appliedId = applySingleSyncObject(connection.driver, validateSyncObjectRecord(record), options);
      if (appliedId) {
        appliedIds.push(appliedId);
      }
    } catch (error) {
      warnSkippedSyncObject(record, error);
    }
  }

  return appliedIds;
}

export async function applySyncObjectsAsync(records: NativeSyncObjectRecord[], options: ApplySyncObjectsOptions = {}) {
  if (records.length === 0) return [];
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'desktop-sync-object-apply' });
  const appliedIds: string[] = [];

  for (const record of records) {
    try {
      appliedIds.push(...await applySyncObjectsWithDbPort(port, [record], options));
    } catch (error) {
      warnSkippedSyncObject(record, error);
    }
  }

  return appliedIds;
}
