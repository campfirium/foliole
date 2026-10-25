import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { identityReviewRowSchema } from '../../lib/core/sync/syncFactRowSchemas.js';
import type { NativeSyncReviewLogRecord } from '../../lib/platform/nativeSyncContract.js';

import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult,
  SyncObjectIdentity
} from './companionSyncPushTypes.js';

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
    const parsed = identityReviewRowSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function reviewLogMatches(existing: ReviewLogDbRow, next: NativeSyncReviewLogRecord) {
  return existing.id === next.id
    && existing.op_id === next.op_id
    && existing.host_name === next.host_name
    && existing.node_id === next.node_id
    && existing.grade === next.grade
    && existing.scheduler_version === next.scheduler_version
    && existing.reviewed_at === next.reviewed_at
    && existing.kind === next.kind
    && existing.voids_op_id === next.voids_op_id;
}

async function selectReviewLogWithDbPort(port: DbPort, opId: string) {
  return (await port.query<ReviewLogDbRow>(
    `SELECT
       id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       kind, voids_op_id
     FROM review_log
     WHERE op_id = ?`,
    [opId]
  ))[0];
}

function insertReviewLogWithDbPort(port: DbPort, record: NativeSyncReviewLogRecord) {
  return port.run(
    `INSERT INTO review_log (
       id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       kind, voids_op_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.op_id,
      record.host_name,
      record.node_id,
      record.grade,
      record.scheduler_version,
      record.reviewed_at,
      record.kind,
      record.voids_op_id
    ]
  );
}

export async function applyReviewLogPushWithDbPort(
  port: DbPort,
  item: CompanionSyncPushPayload
): Promise<CompanionSyncPushResult> {
  return await port.transaction(async (tx) => {
    const record = parseReviewLog(item);
    if (!record || record.host_name !== item.authorHostName) {
      return {
        acks: [rejectAck(item, 'invalid_review_log_source')],
        appliedNodeIds: [],
        appliedObjectIds: [],
        appliedReviewOpIds: []
      };
    }
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
