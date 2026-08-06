import { COMPANION_SYNCBACK_HOST_CONTRACT as CONTRACT } from '../../../../../../lib/core/database/companionSyncbackHostContractDefinitions';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort';
import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../../../../lib/platform/nativeSyncContract';
import type { SyncPushAck } from '../../../companionSyncPushProtocol';

import { rekeyNodeObject } from './companionSyncNodeRekey';

export interface CompanionSyncbackDbStore {
  loadNodeVersions(cursor: NativeSyncChangeCursor | null, limit?: number): Promise<NativeSyncNodeRecord[]>;
  loadNodeVersionPushCursor(): Promise<NativeSyncChangeCursor | null>;
  loadReviewLog(cursor: NativeSyncChangeCursor | null, limit?: number): Promise<NativeSyncReviewLogRecord[]>;
  loadReviewLogPushCursor(): Promise<NativeSyncChangeCursor | null>;
  loadStateChanges(cursor: number | null, limit?: number): Promise<NativeSyncStateObjectRecord[]>;
  loadStatePushCursor(): Promise<number | null>;
  savePushAcks(acks: SyncPushAck[]): Promise<string[]>;
  saveNodeVersionPushCursor(cursor: NativeSyncChangeCursor | null): Promise<NativeSyncChangeCursor | null>;
  saveReviewLogPushCursor(cursor: NativeSyncChangeCursor | null): Promise<NativeSyncChangeCursor | null>;
  saveStatePushCursor(cursor: number | null): Promise<number | null>;
}

export function createCompanionSyncbackDbStore(port: DbPort): CompanionSyncbackDbStore {
  return {
    loadNodeVersions: (cursor, limit) => loadNodeVersions(port, cursor, limit),
    loadNodeVersionPushCursor: () => loadChangeCursor(port, CONTRACT.cursors.nodeVersionPush, 'node_version'),
    loadReviewLog: (cursor, limit) => loadReviewLog(port, cursor, limit),
    loadReviewLogPushCursor: () => loadChangeCursor(port, CONTRACT.cursors.reviewLogPush, 'review_log'),
    loadStateChanges: (cursor, limit) => loadStateChanges(port, cursor, limit),
    loadStatePushCursor: () => loadNumberCursor(port, CONTRACT.cursors.statePush),
    savePushAcks: (acks) => savePushAcks(port, acks),
    saveNodeVersionPushCursor: (cursor) => saveChangeCursor(
      port, CONTRACT.cursors.nodeVersionPush, cursor, 'node_version'
    ),
    saveReviewLogPushCursor: (cursor) => saveChangeCursor(
      port, CONTRACT.cursors.reviewLogPush, cursor, 'review_log'
    ),
    saveStatePushCursor: (cursor) => saveNumberCursor(port, CONTRACT.cursors.statePush, cursor)
  };
}

async function loadNodeVersions(
  port: DbPort,
  cursor: NativeSyncChangeCursor | null,
  limit = CONTRACT.nodeVersions.defaultLimit
) {
  const deviceId = await loadRequiredMeta(port, CONTRACT.deviceIdMetaKey);
  const createdAt = cursor?.created_at ?? '';
  const changeId = cursor?.change_id ?? '';
  const rows = await port.query(CONTRACT.sql.nodeVersions, [
    deviceId, createdAt, changeId, createdAt, createdAt, changeId, normalizeNodeVersionLimit(limit)
  ]);
  return Promise.all(rows.map(async (row) => {
    const snapshot = parseNodeSnapshot(row.snapshot) as NativeSyncNodeRecord['snapshot'];
    const parentVersionIds = await loadDirectParentVersionIds(port, String(row.version_id));
    return {
      ...row,
      ancestor_version_ids: await loadAncestorVersionIds(port, parentVersionIds),
      body_text: typeof row.body_text === 'string' ? row.body_text : snapshot.content ?? '',
      is_tombstone: Number(row.is_tombstone) === 1,
      parent_version_ids: parentVersionIds,
      snapshot
    };
  })) as Promise<NativeSyncNodeRecord[]>;
}

async function loadDirectParentVersionIds(port: DbPort, versionId: string) {
  const rows = await port.query<DbRow>(CONTRACT.sql.nodeVersionParent, [versionId]);
  return rows.map((row) => row.parent_version_id)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

async function loadAncestorVersionIds(port: DbPort, directParents: string[]) {
  const ancestors: string[] = [];
  const pending = [...directParents];
  const seen = new Set<string>();
  for (let depth = 0; depth < CONTRACT.nodeVersions.ancestorDepthLimit; depth += 1) {
    const versionId = pending.shift();
    if (!versionId) break;
    if (seen.has(versionId)) continue;
    seen.add(versionId);
    ancestors.push(versionId);
    pending.push(...await loadDirectParentVersionIds(port, versionId));
  }
  return ancestors;
}

function parseNodeSnapshot(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') throw new Error('invalid_companion_node_version_snapshot');
  try {
    const snapshot = JSON.parse(value) as unknown;
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) return snapshot;
  } catch { /* invalid snapshot handled below */ }
  throw new Error('invalid_companion_node_version_snapshot');
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
  return typeof payload.payload_json === 'string' ? payload.payload_json : JSON.stringify(payload);
}

function payloadSql(objectType: NativeSyncStateObjectRecord['object_type']) {
  if (objectType === 'node_open_state') return CONTRACT.sql.openStatePayload;
  if (objectType === 'node_reading') return CONTRACT.sql.readingPayload;
  if (objectType === 'node_review') return CONTRACT.sql.reviewPayload;
  if (objectType === 'node_text_alternative') return CONTRACT.sql.alternativePayload;
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

async function loadChangeCursor(port: DbPort, key: string, stream: 'node_version' | 'review_log') {
  const raw = await loadMeta(port, key);
  if (raw === null) return null;
  try {
    const cursor = JSON.parse(raw) as Partial<NativeSyncChangeCursor>;
    if (typeof cursor.created_at === 'string' && typeof cursor.change_id === 'string') {
      return { change_id: cursor.change_id, created_at: cursor.created_at };
    }
  } catch { /* invalid cursor handled below */ }
  throw new Error(`invalid_companion_${stream}_push_cursor`);
}

async function saveNumberCursor(port: DbPort, key: string, cursor: number | null) {
  if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 0)) {
    throw new Error('invalid_companion_state_push_cursor');
  }
  await saveMeta(port, key, cursor === null ? null : String(cursor));
  return cursor;
}

async function saveChangeCursor(
  port: DbPort,
  key: string,
  cursor: NativeSyncChangeCursor | null,
  stream: 'node_version' | 'review_log'
) {
  if (cursor && (!cursor.created_at.trim() || !cursor.change_id.trim())) {
    throw new Error(`invalid_companion_${stream}_push_cursor`);
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
      if (ack.identity.objectType === 'node' && ack.canonicalObjectId
        && ack.canonicalObjectId !== ack.identity.objectId) {
        await rekeyNodeObject(tx, ack.identity.objectId, ack.canonicalObjectId);
      }
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

function normalizeNodeVersionLimit(limit: number) {
  if (!Number.isFinite(limit)) return CONTRACT.nodeVersions.defaultLimit;
  return Math.min(CONTRACT.nodeVersions.maxLimit, Math.max(CONTRACT.nodeVersions.minLimit, Math.trunc(limit)));
}
