import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { NativeSyncReviewLogRecord } from '../../lib/platform/nativeSyncContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult,
  SyncObjectIdentity
} from './companionSyncPushTypes.js';
import { openDatabaseConnection } from './connection.js';

interface ReviewLogRow extends DatabaseRow, NativeSyncReviewLogRecord {}
interface ReviewLogDbRow extends DbRow, NativeSyncReviewLogRecord {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectAck(item: CompanionSyncPushPayload, reason: string) {
  return {
    clientOpId: item.clientOpId,
    conflictReason: reason,
    identity: item.identity as SyncObjectIdentity,
    status: 'rejected' as const
  };
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

async function selectReviewLogWithDbPort(port: DbPort, opId: string) {
  return (await port.query<ReviewLogDbRow>(
    `SELECT
       id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log
     WHERE op_id = ?`,
    [opId]
  ))[0];
}

function insertReviewLogWithDbPort(port: DbPort, record: NativeSyncReviewLogRecord) {
  return port.run(
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

export function applyReviewLogPush(driver: DatabaseDriver, item: CompanionSyncPushPayload): CompanionSyncPushResult {
  return driver.transaction((transactionDriver) => {
    const record = parseReviewLog(item);
    if (!record) return { acks: [rejectAck(item, 'invalid_review_log_push')], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
    const existing = selectReviewLog(transactionDriver, record.op_id);
    if (existing) {
      const matches = reviewLogMatches(existing, record);
      return {
        acks: [{
          clientOpId: item.clientOpId,
          identity: item.identity,
          status: matches ? 'already_applied' : 'rejected',
          ...(matches ? {} : { conflictReason: 'op_id_payload_mismatch' })
        }],
        appliedNodeIds: [],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    insertReviewLog(transactionDriver, record);
    return {
      acks: [{ clientOpId: item.clientOpId, identity: item.identity, status: 'accepted' }],
      appliedNodeIds: [],
      appliedObjectIds: [],
      appliedReviewOpIds: [record.op_id]
    };
  });
}

export async function applyReviewLogPushAsync(item: CompanionSyncPushPayload): Promise<CompanionSyncPushResult> {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-review-log-push' });
  return await port.transaction(async (tx) => {
    const record = parseReviewLog(item);
    if (!record) return { acks: [rejectAck(item, 'invalid_review_log_push')], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
    const existing = await selectReviewLogWithDbPort(tx, record.op_id);
    if (existing) {
      const matches = reviewLogMatches(existing, record);
      return {
        acks: [{
          clientOpId: item.clientOpId,
          identity: item.identity,
          status: matches ? 'already_applied' as const : 'rejected' as const,
          ...(matches ? {} : { conflictReason: 'op_id_payload_mismatch' })
        }],
        appliedNodeIds: [],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
    await insertReviewLogWithDbPort(tx, record);
    return {
      acks: [{ clientOpId: item.clientOpId, identity: item.identity, status: 'accepted' }],
      appliedNodeIds: [],
      appliedObjectIds: [],
      appliedReviewOpIds: [record.op_id]
    };
  });
}
