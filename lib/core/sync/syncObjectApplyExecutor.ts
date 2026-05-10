import type { NativeSyncObjectRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { applySyncObjectPayloadWithDbPort } from './syncObjectPayloadExecutor.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

const REMOTE_DEVICE_ID = 'sync-remote';
const STATE_OBJECT_TYPES = new Set<NativeSyncObjectRecord['object_type']>([
  'attachment',
  'external_document',
  'external_folder',
  'import_source',
  'node_reading',
  'node_review',
  'pdf_page_text',
  'readwise_source',
  'setting',
  'view_state'
]);

interface ExistingSyncObjectState extends DbRow {
  content_hash: string;
  deleted_at: string | null;
  updated_at: string;
}

export interface ApplySyncObjectsWithDbPortOptions {
  includeAlreadyApplied?: boolean;
  deviceId?: string;
}

type SyncObjectApplyStatus = 'apply' | 'already_applied' | 'stale';

export async function applySyncObjectsWithDbPort(
  port: DbPort,
  records: NativeSyncObjectRecord[],
  options: ApplySyncObjectsWithDbPortOptions = {}
) {
  const appliedIds: string[] = [];
  for (const record of records) {
    const appliedId = await applySingleSyncObject(port, validateSyncObjectRecord(record), options);
    if (appliedId) appliedIds.push(appliedId);
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

async function applySingleSyncObject(
  port: DbPort,
  record: SyncPackSyncObjectRecord,
  options: ApplySyncObjectsWithDbPortOptions
) {
  return await port.transaction(async (tx) => {
    const status = await getSyncObjectApplyStatus(tx, record);
    if (status === 'already_applied') {
      return options.includeAlreadyApplied ? `${record.object_type}:${record.object_id}` : null;
    }
    if (status === 'stale') return null;
    const appliedPayload = await applySyncObjectPayloadWithDbPort(tx, record, { deviceId: options.deviceId });
    if (appliedPayload === false) return null;
    await tx.run(
      `INSERT INTO sync_object_state (` +
      `object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, deleted_at` +
      `) VALUES (?, ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, ?, ?, 0, ?) ` +
      `ON CONFLICT(object_type, object_id) DO UPDATE SET ` +
      `state_seq = excluded.state_seq, content_hash = excluded.content_hash, ` +
      `last_modified_by_device_id = excluded.last_modified_by_device_id, updated_at = excluded.updated_at, ` +
      `sync_dirty = excluded.sync_dirty, deleted_at = excluded.deleted_at`,
      [record.object_type, record.object_id, record.content_hash, REMOTE_DEVICE_ID, record.updated_at, record.deleted_at]
    );
    return `${record.object_type}:${record.object_id}`;
  });
}

async function getSyncObjectApplyStatus(port: DbPort, record: SyncPackSyncObjectRecord): Promise<SyncObjectApplyStatus> {
  const current = (await port.query<ExistingSyncObjectState>(
    'SELECT content_hash, deleted_at, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    [record.object_type, record.object_id]
  ))[0];
  if (!current) return 'apply';
  if (current.content_hash === record.content_hash && current.deleted_at === record.deleted_at) return 'already_applied';
  return current.updated_at <= record.updated_at ? 'apply' : 'stale';
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
