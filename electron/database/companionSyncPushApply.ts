import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type {
  NativeSyncObjectRecord,
  NativeSyncObjectType,
  NativeSyncReviewLogRecord
} from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';
import { applySyncObjectPayload } from './syncObjectApplyPayloads.js';

const REMOTE_DEVICE_ID = 'companion-push';

type SyncPushStatus = 'accepted' | 'already_applied' | 'conflict' | 'rejected';

type SyncBaseReference =
  | { kind: 'blocked'; reason: 'missing_base_reference' }
  | { baseContentHash: string; kind: 'content_hash' }
  | { kind: 'op_id'; opId: string };

interface SyncObjectIdentity {
  objectId: string;
  objectType: string;
  scope: string;
}

export interface CompanionSyncPushPayload {
  base: SyncBaseReference;
  clientOpId: string;
  contentHash?: string;
  deletedAt?: string | null;
  identity: SyncObjectIdentity;
  payloadJson: string | null;
  updatedAt?: string;
}

interface CompanionSyncPushAck {
  clientOpId: string;
  conflictReason?: string;
  desktopBase?: SyncBaseReference;
  identity: SyncObjectIdentity;
  stateSeq?: number | null;
  status: SyncPushStatus;
}

interface SyncObjectStateRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  state_seq: number;
  updated_at: string;
}

interface ReviewLogRow extends DatabaseRow, NativeSyncReviewLogRecord {}

export interface CompanionSyncPushResult {
  acks: CompanionSyncPushAck[];
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function rejectAck(item: CompanionSyncPushPayload, reason: string): CompanionSyncPushAck {
  return {
    clientOpId: item.clientOpId,
    conflictReason: reason,
    identity: item.identity,
    status: 'rejected'
  };
}

function currentState(driver: DatabaseDriver, identity: SyncObjectIdentity) {
  return driver.queryOne<SyncObjectStateRow>(
    `SELECT content_hash, deleted_at, state_seq, updated_at
     FROM sync_object_state
     WHERE object_type = ? AND object_id = ?`,
    [identity.objectType, identity.objectId]
  );
}

function desktopBase(row: SyncObjectStateRow | undefined): SyncBaseReference | undefined {
  return row ? { baseContentHash: row.content_hash, kind: 'content_hash' } : undefined;
}

type StatePushObjectType = Extract<NativeSyncObjectType, 'node_reading' | 'node_review'>;

function buildStateObjectRecord(
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType
): NativeSyncObjectRecord | null {
  if (item.identity.objectType !== objectType || item.identity.scope !== 'workspace') return null;
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

function applyStateObjectPush(
  driver: DatabaseDriver,
  item: CompanionSyncPushPayload,
  objectType: StatePushObjectType
): CompanionSyncPushResult {
  return driver.transaction((transactionDriver) => {
    const current = currentState(transactionDriver, item.identity);
    const record = buildStateObjectRecord(item, objectType);
    if (!record || item.base.kind !== 'content_hash') {
      return { acks: [rejectAck(item, `invalid_${objectType}_push`)], appliedObjectIds: [], appliedReviewOpIds: [] };
    }
    if (current?.content_hash === record.content_hash && current.deleted_at === record.deleted_at) {
      return {
        acks: [{
          clientOpId: item.clientOpId,
          desktopBase: desktopBase(current),
          identity: item.identity,
          stateSeq: current.state_seq,
          status: 'already_applied'
        }],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    if (!current || current.content_hash !== item.base.baseContentHash) {
      return {
        acks: [{
          clientOpId: item.clientOpId,
          conflictReason: 'base_content_hash_mismatch',
          desktopBase: desktopBase(current),
          identity: item.identity,
          stateSeq: current?.state_seq ?? null,
          status: 'conflict'
        }],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    applySyncObjectPayload(transactionDriver, record);
    upsertSyncObjectState(transactionDriver, {
      contentHash: record.content_hash,
      deletedAt: record.deleted_at,
      lastModifiedByDeviceId: REMOTE_DEVICE_ID,
      objectId: record.object_id,
      objectType: record.object_type,
      syncDirty: false,
      updatedAt: record.updated_at
    });
    const updated = currentState(transactionDriver, item.identity);
    return {
      acks: [{
        clientOpId: item.clientOpId,
        desktopBase: desktopBase(updated),
        identity: item.identity,
        stateSeq: updated?.state_seq ?? null,
        status: 'accepted'
      }],
      appliedObjectIds: [`${objectType}:${record.object_id}`],
      appliedReviewOpIds: []
    };
  });
}

function parseReviewLog(item: CompanionSyncPushPayload): NativeSyncReviewLogRecord | null {
  if (item.identity.objectType !== 'review_log' || item.identity.scope !== 'workspace') return null;
  if (item.base.kind !== 'op_id' || item.base.opId !== item.identity.objectId || item.payloadJson === null) return null;
  try {
    const payload = JSON.parse(item.payloadJson) as unknown;
    if (!isRecord(payload) || payload.op_id !== item.identity.objectId) return null;
    return payload as unknown as NativeSyncReviewLogRecord;
  } catch {
    return null;
  }
}

function selectReviewLog(driver: DatabaseDriver, opId: string) {
  return driver.queryOne<ReviewLogRow>(
    `SELECT
       id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log
     WHERE op_id = ?`,
    [opId]
  );
}

function reviewLogMatches(existing: ReviewLogRow, next: NativeSyncReviewLogRecord) {
  return existing.id === next.id
    && existing.op_id === next.op_id
    && existing.device_id === next.device_id
    && existing.node_id === next.node_id
    && existing.grade === next.grade
    && existing.scheduler_version === next.scheduler_version
    && existing.reviewed_at === next.reviewed_at
    && existing.due_before === next.due_before
    && existing.stability_before === next.stability_before
    && existing.difficulty_before === next.difficulty_before
    && existing.due_after === next.due_after
    && existing.stability_after === next.stability_after
    && existing.difficulty_after === next.difficulty_after;
}

function insertReviewLog(driver: DatabaseDriver, record: NativeSyncReviewLogRecord) {
  driver.execute(
    `INSERT INTO review_log (
       id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.op_id,
      record.device_id,
      record.node_id,
      record.grade,
      record.scheduler_version,
      record.reviewed_at,
      record.due_before,
      record.stability_before,
      record.difficulty_before,
      record.due_after,
      record.stability_after,
      record.difficulty_after
    ]
  );
}

function applyReviewLogPush(driver: DatabaseDriver, item: CompanionSyncPushPayload): CompanionSyncPushResult {
  return driver.transaction((transactionDriver) => {
    const record = parseReviewLog(item);
    if (!record) {
      return { acks: [rejectAck(item, 'invalid_review_log_push')], appliedObjectIds: [], appliedReviewOpIds: [] };
    }
    const existing = selectReviewLog(transactionDriver, record.op_id);
    if (existing) {
      return {
        acks: [{
          clientOpId: item.clientOpId,
          identity: item.identity,
          status: reviewLogMatches(existing, record) ? 'already_applied' : 'rejected',
          ...(reviewLogMatches(existing, record) ? {} : { conflictReason: 'op_id_payload_mismatch' })
        }],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    insertReviewLog(transactionDriver, record);
    return {
      acks: [{ clientOpId: item.clientOpId, identity: item.identity, status: 'accepted' }],
      appliedObjectIds: [],
      appliedReviewOpIds: [record.op_id]
    };
  });
}

function applySinglePushItem(driver: DatabaseDriver, item: CompanionSyncPushPayload): CompanionSyncPushResult {
  try {
    if (item.identity.objectType === 'node_reading' || item.identity.objectType === 'node_review') {
      return applyStateObjectPush(driver, item, item.identity.objectType);
    }
    if (item.identity.objectType === 'review_log') {
      return applyReviewLogPush(driver, item);
    }
    return { acks: [rejectAck(item, 'unsupported_object_type')], appliedObjectIds: [], appliedReviewOpIds: [] };
  } catch (error) {
    return {
      acks: [rejectAck(item, error instanceof Error ? error.message : 'apply_failed')],
      appliedObjectIds: [],
      appliedReviewOpIds: []
    };
  }
}

export function applyCompanionSyncPush(items: CompanionSyncPushPayload[]): CompanionSyncPushResult {
  const driver = openDatabaseConnection().driver;
  return items.reduce<CompanionSyncPushResult>((result, item) => {
    const itemResult = applySinglePushItem(driver, item);
    result.acks.push(...itemResult.acks);
    result.appliedObjectIds.push(...itemResult.appliedObjectIds);
    result.appliedReviewOpIds.push(...itemResult.appliedReviewOpIds);
    return result;
  }, { acks: [], appliedObjectIds: [], appliedReviewOpIds: [] });
}
