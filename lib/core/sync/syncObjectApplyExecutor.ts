import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';
import { applySyncObjectPayloadWithDbPort } from './syncObjectPayloadExecutor.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

const REMOTE_DEVICE_ID = 'sync-remote';
export const SYNC_OBJECT_APPLY_BATCH_SIZE = 25;
const STATE_OBJECT_TYPES = new Set<NativeSyncObjectRecord['object_type']>([
  'attachment',
  'external_document',
  'external_folder',
  'import_source',
  'node_open_state',
  'node_reading',
  'node_review',
  'pdf_page_text',
  'setting',
  'watched_folder',
  'view_state'
]);

interface ExistingSyncObjectState extends DbRow {
  content_hash: string;
  deleted_at: string | null;
  updated_at: string;
}

export interface ApplySyncObjectsWithDbPortOptions {
  includeAlreadyApplied?: boolean;
  hostName?: string;
  onSkippedRecord?: (record: unknown, reason: unknown) => void;
  onPayloadAppliedInTransaction?: (port: DbPort, record: SyncPackSyncObjectRecord) => Promise<void>;
}

type SyncObjectApplyStatus = 'apply' | 'already_applied' | 'stale';

export async function applySyncObjectsWithDbPort(
  port: DbPort,
  records: NativeSyncObjectRecord[],
  options: ApplySyncObjectsWithDbPortOptions = {}
) {
  const appliedIds: string[] = [];
  for (let index = 0; index < records.length; index += SYNC_OBJECT_APPLY_BATCH_SIZE) {
    const batch = records.slice(index, index + SYNC_OBJECT_APPLY_BATCH_SIZE);
    try {
      appliedIds.push(...await applySyncObjectBatch(port, batch.map(validateSyncObjectRecord), options));
    } catch {
      appliedIds.push(...await applySyncObjectBatchWithIsolation(port, batch, options));
    }
  }
  return appliedIds;
}

function validateSyncObjectRecord(value: unknown): SyncPackSyncObjectRecord {
  if (!isRecord(value)) throw new Error('Invalid sync object record');
  const objectType = requireString(value, 'object_type') as NativeSyncObjectRecord['object_type'];
  if (!STATE_OBJECT_TYPES.has(objectType)) throw new Error(`Unsupported sync object type: ${objectType}`);
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

async function applySyncObjectBatch(
  port: DbPort,
  records: SyncPackSyncObjectRecord[],
  options: ApplySyncObjectsWithDbPortOptions
) {
  return await port.transaction(async (tx) => {
    const appliedIds: string[] = [];
    for (const record of records) {
      const appliedId = await applySingleSyncObjectInTransaction(tx, record, options);
      if (appliedId) appliedIds.push(appliedId);
    }
    if (appliedIds.some((id) => id.startsWith('node_reading:') || id.startsWith('node_review:'))) {
      await pruneLearningRowsWithoutVisibleNodes(tx);
    }
    return appliedIds;
  });
}

async function applySyncObjectBatchWithIsolation(
  port: DbPort,
  records: NativeSyncObjectRecord[],
  options: ApplySyncObjectsWithDbPortOptions
) {
  const appliedIds: string[] = [];
  for (const record of records) {
    try {
      appliedIds.push(...await applySyncObjectBatch(port, [validateSyncObjectRecord(record)], options));
    } catch (error) {
      options.onSkippedRecord?.(record, error);
    }
  }
  return appliedIds;
}

async function applySingleSyncObjectInTransaction(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: ApplySyncObjectsWithDbPortOptions
) {
  const status = await getSyncObjectApplyStatus(port, record);
  if (status === 'already_applied') {
    return options.includeAlreadyApplied ? `${record.object_type}:${record.object_id}` : null;
  }
  if (status === 'stale') return null;
  const appliedPayload = await applySyncObjectPayloadWithDbPort(
    port,
    record,
    options.hostName === undefined ? {} : { hostName: options.hostName }
  );
  if (appliedPayload === false) return null;
  await options.onPayloadAppliedInTransaction?.(port, record);
  await upsertAppliedSyncObjectState(port, record);
  return `${record.object_type}:${record.object_id}`;
}

async function upsertAppliedSyncObjectState(port: DbPort, record: SyncPackSyncObjectRecord) {
  await port.run(
    `INSERT INTO sync_object_state (` +
    `object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty, deleted_at` +
    `) VALUES (?, ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, ?, ?, 0, ?) ` +
    `ON CONFLICT(object_type, object_id) DO UPDATE SET ` +
    `state_seq = excluded.state_seq, content_hash = excluded.content_hash, ` +
    `last_modified_by_host_name = excluded.last_modified_by_host_name, updated_at = excluded.updated_at, ` +
    `sync_dirty = excluded.sync_dirty, deleted_at = excluded.deleted_at`,
    [record.object_type, record.object_id, record.content_hash, REMOTE_DEVICE_ID, record.updated_at, record.deleted_at]
  );
}

async function getSyncObjectApplyStatus(port: DbPort, record: SyncPackSyncObjectRecord): Promise<SyncObjectApplyStatus> {
  const current = (await port.query<ExistingSyncObjectState>(
    'SELECT content_hash, deleted_at, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    [record.object_type, record.object_id]
  ))[0];
  if (!current) return 'apply';
  if (current.content_hash === record.content_hash && current.deleted_at === record.deleted_at) return 'already_applied';
  const currentKey = `${current.updated_at}\n${current.content_hash}\n${current.deleted_at ?? ''}`;
  const incomingKey = `${record.updated_at}\n${record.content_hash}\n${record.deleted_at ?? ''}`;
  return currentKey < incomingKey ? 'apply' : 'stale';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(raw: Record<string, unknown>, key: keyof NativeSyncObjectRecord) {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid sync object ${key}`);
  return value;
}

function readDeletedAt(raw: Record<string, unknown>) {
  if (!Object.hasOwn(raw, 'deleted_at')) throw new Error('Invalid sync object deleted_at');
  const value = raw.deleted_at;
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Invalid sync object deleted_at');
  return value;
}

function readPayloadJson(raw: Record<string, unknown>, deletedAt: string | null) {
  if (!Object.hasOwn(raw, 'payload_json')) throw new Error('Invalid sync object payload_json');
  const value = raw.payload_json;
  if (value === null) {
    if (deletedAt === null) throw new Error('Invalid sync object payload_json');
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Invalid sync object payload_json');
  return value;
}
