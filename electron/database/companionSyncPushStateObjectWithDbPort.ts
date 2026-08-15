import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { applySyncObjectPayloadWithDbPort } from '../../lib/core/sync/syncObjectPayloadExecutor.js';
import type { NativeSyncObjectRecord, NativeSyncObjectType } from '../../lib/platform/nativeSyncContract.js';

import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult,
  SyncObjectIdentity
} from './companionSyncPushTypes.js';
import { materializeDesktopSettingRecord } from './desktopSettingMaterializer.js';

export type StatePushObjectType = Extract<NativeSyncObjectType, 'node_open_state' | 'node_reading' | 'node_review' | 'node_text_alternative' | 'setting' | 'view_state'>;

interface SyncObjectStateRow extends DbRow {
  content_hash: string;
  deleted_at: string | null;
  state_seq: number;
  updated_at: string;
}

export function isStateObjectPush(item: CompanionSyncPushPayload) {
  return item.identity.objectType === 'node_open_state'
    || item.identity.objectType === 'node_reading'
    || item.identity.objectType === 'node_review'
    || item.identity.objectType === 'node_text_alternative'
    || item.identity.objectType === 'setting'
    || item.identity.objectType === 'view_state';
}

export async function applyStateObjectPushWithDbPort(
  port: DbPort,
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType,
  sourceDeviceId: string
) {
  return await port.transaction(async (tx) => {
    const current = await currentState(tx, item.identity);
    const record = buildStateObjectRecord(item, objectType);
    if (!record || item.base.kind !== 'content_hash') return rejectedStateObjectPushResult(item, `invalid_${objectType}_push`);
    if (objectType === 'view_state') return rejectedStateObjectPushResult(item, 'device_private_view_state_push');
    if (sameStateObject(current, record, objectType)) {
      return emptyResult(stateAck(item, current, 'already_applied'));
    }
    if (objectType === 'node_open_state') {
      if (current && current.content_hash !== item.base.baseContentHash
        && current.updated_at >= record.updated_at) {
        return emptyResult(stateAck(item, current, 'already_applied'));
      }
    } else if (objectType !== 'node_review'
      && ((current && current.content_hash !== item.base.baseContentHash) || (!current && item.base.baseContentHash !== null))) {
      return emptyResult({
        clientOpId: item.clientOpId,
        conflictReason: 'base_content_hash_mismatch',
        ...(current ? { desktopBase: desktopBase(current) } : {}),
        identity: item.identity,
        stateSeq: current?.state_seq ?? null,
        status: 'conflict'
      });
    }
    const materialized = await applySyncObjectPayloadWithDbPort(tx, record);
    if (objectType === 'node_review' && materialized === false) {
      return emptyResult(stateAck(item, current, 'already_applied'));
    }
    await materializeDesktopSettingRecord(tx, record);
    await upsertState(tx, record, sourceDeviceId);
    const updated = await currentState(tx, item.identity);
    return {
      acks: [stateAck(item, updated, 'accepted')],
      appliedNodeIds: [],
      appliedObjectIds: [`${objectType}:${record.object_id}`],
      appliedReviewOpIds: []
    };
  });
}

function sameStateObject(
  current: SyncObjectStateRow | undefined,
  record: NativeSyncObjectRecord,
  objectType: StatePushObjectType
) {
  if (!current) return false;
  if (current.content_hash === record.content_hash && current.deleted_at === record.deleted_at) return true;
  return objectType === 'node_text_alternative'
    && typeof current.deleted_at === 'string' && typeof record.deleted_at === 'string';
}

function buildStateObjectRecord(
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType
): NativeSyncObjectRecord | null {
  if (item.identity.objectType !== objectType || !validStateObjectScope(item, objectType)) return null;
  const contentHash = readString(item.contentHash);
  const updatedAt = readString(item.updatedAt);
  if (!contentHash || !updatedAt) return null;
  return {
    content_hash: contentHash,
    deleted_at: item.deletedAt ?? null,
    object_id: item.identity.objectId,
    object_type: objectType,
    payload_json: item.payloadJson,
    updated_at: updatedAt
  };
}

function validStateObjectScope(item: CompanionSyncPushPayload, objectType: StatePushObjectType) {
  if (objectType === 'setting' || objectType === 'view_state') {
    const parts = item.identity.objectId.split(':', 5);
    return parts.length === 5 && parts.every((part) => part.trim()) && item.identity.scope === parts[0];
  }
  return item.identity.scope === 'workspace';
}

async function currentState(port: DbPort, identity: SyncObjectIdentity) {
  return (await port.query<SyncObjectStateRow>(
    `SELECT content_hash, deleted_at, state_seq, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ?`,
    [identity.objectType, identity.objectId]
  ))[0];
}

function upsertState(port: DbPort, record: NativeSyncObjectRecord, sourceDeviceId: string) {
  return port.run(
    `INSERT INTO sync_object_state (` +
    `object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty, deleted_at` +
    `) VALUES (?, ?, COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1), ?, ?, ?, 0, ?) ` +
    `ON CONFLICT(object_type, object_id) DO UPDATE SET state_seq = excluded.state_seq, content_hash = excluded.content_hash, ` +
    `last_modified_by_device_id = excluded.last_modified_by_device_id, updated_at = excluded.updated_at, ` +
    `sync_dirty = excluded.sync_dirty, deleted_at = excluded.deleted_at`,
    [record.object_type, record.object_id, record.content_hash, sourceDeviceId, record.updated_at, record.deleted_at]
  );
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function desktopBase(row: SyncObjectStateRow) {
  return { baseContentHash: row.content_hash, kind: 'content_hash' as const };
}

function stateAck(item: CompanionSyncPushPayload, row: SyncObjectStateRow | undefined, status: 'accepted' | 'already_applied') {
  return {
    clientOpId: item.clientOpId,
    ...(row ? { desktopBase: desktopBase(row) } : {}),
    identity: item.identity,
    stateSeq: row?.state_seq ?? null,
    status
  };
}

export function rejectedStateObjectPushResult(
  item: CompanionSyncPushPayload,
  reason: string
): CompanionSyncPushResult {
  return emptyResult({
    clientOpId: item.clientOpId, conflictReason: reason, identity: item.identity, status: 'rejected'
  });
}

function emptyResult(ack: CompanionSyncPushResult['acks'][number]): CompanionSyncPushResult {
  return { acks: [ack], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
}
