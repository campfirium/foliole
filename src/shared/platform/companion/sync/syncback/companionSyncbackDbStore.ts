import { COMPANION_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionSyncbackHostContractDefinitions';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';
import type {
  NativeSyncChangeCursor,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../../../../lib/platform/nativeSyncContract';
import type { SyncPushAck } from '../../../companionSyncPushProtocol';

export interface CompanionSyncbackDbStore {
  loadReviewLog(cursor: NativeSyncChangeCursor | null, limit?: number): Promise<NativeSyncReviewLogRecord[]>;
  loadReviewLogPushCursor(): Promise<NativeSyncChangeCursor | null>;
  loadStateChanges(cursor: number | null, limit?: number): Promise<NativeSyncStateObjectRecord[]>;
  loadStatePushCursor(): Promise<number | null>;
  savePushAcks(acks: SyncPushAck[]): Promise<string[]>;
  saveReviewLogPushCursor(cursor: NativeSyncChangeCursor | null): Promise<NativeSyncChangeCursor | null>;
  saveStatePushCursor(cursor: number | null): Promise<number | null>;
}

export function createCompanionSyncbackDbStore(port: DbPort): CompanionSyncbackDbStore {
  return {
    loadReviewLog: (cursor, limit) => loadReviewLog(port, cursor, limit),
    loadReviewLogPushCursor: () => loadChangeCursor(port, CONTRACT.cursors.reviewLogPush),
    loadStateChanges: (cursor, limit) => loadStateChanges(port, cursor, limit),
    loadStatePushCursor: () => loadNumberCursor(port, CONTRACT.cursors.statePush),
    savePushAcks: (acks) => savePushAcks(port, acks),
    saveReviewLogPushCursor: (cursor) => saveChangeCursor(port, CONTRACT.cursors.reviewLogPush, cursor),
    saveStatePushCursor: (cursor) => saveNumberCursor(port, CONTRACT.cursors.statePush, cursor)
  };
}

async function loadStateChanges(port: DbPort, cursor: number | null, limit = CONTRACT.limits.default) {
  const rows = await port.query(
    CONTRACT.sql.state,
    [normalizeNumberCursor(cursor), normalizeLimit(limit)]
  ) as unknown as NativeSyncStateObjectRecord[];
  return Promise.all(rows.map(async (row) => ({
    ...row,
    payload_json: row.deleted_at ? null : await loadPayloadJson(port, row)
  })));
}

async function loadPayloadJson(port: DbPort, row: NativeSyncStateObjectRecord) {
  const payload = (await port.query(payloadSql(row.object_type), [row.object_id]))[0] ?? {};
  if (row.object_type !== 'setting') return JSON.stringify(payload);
  return typeof payload.payload_json === 'string' ? payload.payload_json : '{}';
}

function payloadSql(objectType: NativeSyncStateObjectRecord['object_type']) {
  if (objectType === 'node_reading') return CONTRACT.sql.readingPayload;
  if (objectType === 'node_review') return CONTRACT.sql.reviewPayload;
  if (objectType === 'setting') return CONTRACT.sql.settingPayload;
  throw new Error(`unsupported_companion_syncback_object:${objectType}`);
}

async function loadReviewLog(port: DbPort, cursor: NativeSyncChangeCursor | null, limit = CONTRACT.limits.default) {
  const deviceId = await loadRequiredMeta(port, CONTRACT.deviceIdMetaKey);
  const createdAt = cursor?.created_at ?? '';
  const changeId = cursor?.change_id ?? '';
  return port.query(CONTRACT.sql.reviewLog, [
    deviceId, createdAt, changeId, createdAt, createdAt, changeId, normalizeLimit(limit)
  ]) as unknown as Promise<NativeSyncReviewLogRecord[]>;
}

async function loadNumberCursor(port: DbPort, key: string) {
  const raw = await loadMeta(port, key);
  if (raw === null) return null;
  const cursor = Number(raw);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('invalid_companion_state_push_cursor');
  return cursor;
}

async function loadChangeCursor(port: DbPort, key: string) {
  const raw = await loadMeta(port, key);
  if (raw === null) return null;
  try {
    const cursor = JSON.parse(raw) as Partial<NativeSyncChangeCursor>;
    if (typeof cursor.created_at === 'string' && typeof cursor.change_id === 'string') {
      return { change_id: cursor.change_id, created_at: cursor.created_at };
    }
  } catch { /* invalid cursor handled below */ }
  throw new Error('invalid_companion_review_log_push_cursor');
}

async function saveNumberCursor(port: DbPort, key: string, cursor: number | null) {
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 0)) {
    throw new Error('invalid_companion_state_push_cursor');
  }
  await saveMeta(port, key, cursor === null ? null : String(cursor));
  return cursor;
}

async function saveChangeCursor(port: DbPort, key: string, cursor: NativeSyncChangeCursor | null) {
  if (cursor && (!cursor.created_at.trim() || !cursor.change_id.trim())) {
    throw new Error('invalid_companion_review_log_push_cursor');
  }
  await saveMeta(port, key, cursor === null ? null : JSON.stringify(cursor));
  return cursor;
}

async function savePushAcks(port: DbPort, acks: SyncPushAck[]) {
  const saved: string[] = [];
  await port.transaction(async (tx) => {
    const now = new Date().toISOString();
    for (const ack of acks) {
      if (!isValidAck(ack)) continue;
      await tx.run(CONTRACT.sql.ackDeleteIssues, [ack.identity.objectType, ack.identity.objectId]);
      await tx.run(CONTRACT.sql.ackUpsert, [
        ack.clientOpId, ack.identity.objectType, ack.identity.objectId, ack.stateSeq ?? null, ack.status, now
      ]);
      saved.push(ack.clientOpId);
    }
  });
  return saved;
}

function isValidAck(ack: SyncPushAck) {
  const rules = CONTRACT.pushAck;
  const confirming = includesString(rules.confirmingStatuses, ack.status);
  if (!includesString(rules.statuses, ack.status) || !ack.clientOpId.trim() || !ack.identity.objectId.trim()) return false;
  if (confirming && includesString(rules.stateSeqRejectedObjectTypes, ack.identity.objectType)) return false;
  if (confirming && !includesString(rules.stateSeqOptionalObjectTypes, ack.identity.objectType)) {
    return typeof ack.stateSeq === 'number';
  }
  return Boolean(ack.identity.objectType);
}

function includesString(values: readonly string[], value: string) {
  return values.includes(value);
}

async function loadMeta(port: DbPort, key: string) {
  const row = (await port.query<DbRow>(CONTRACT.sql.metaQuery, [key]))[0];
  return typeof row?.value === 'string' && row.value.length > 0 ? row.value : null;
}

async function loadRequiredMeta(port: DbPort, key: string) {
  const value = await loadMeta(port, key);
  if (!value) throw new Error(`missing_companion_meta:${key}`);
  return value;
}

async function saveMeta(port: DbPort, key: string, value: string | null) {
  if (value === null) {
    await port.run(CONTRACT.sql.metaDelete, [key]);
    return;
  }
  await port.run(CONTRACT.sql.metaUpsert, [key, value, new Date().toISOString()]);
}

function normalizeNumberCursor(cursor: number | null) {
  return Number.isSafeInteger(cursor) && (cursor ?? 0) > 0 ? cursor as number : 0;
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return CONTRACT.limits.default;
  return Math.min(CONTRACT.limits.max, Math.max(CONTRACT.limits.min, Math.trunc(limit)));
}
