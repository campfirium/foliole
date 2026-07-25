import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { SyncNodeApplyOperation } from '../../lib/core/sync/syncNodeApplyRules.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import type { CompanionSyncPushPayload, CompanionSyncPushResult } from './companionSyncPushTypes.js';

export function rejectNodeVersionPush(
  item: CompanionSyncPushPayload,
  reason: string
): CompanionSyncPushResult {
  return {
    acks: [{
      clientOpId: item.clientOpId,
      conflictReason: reason,
      identity: item.identity,
      status: 'rejected'
    }],
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}

export function parseNodeVersionPush(item: CompanionSyncPushPayload): NativeSyncNodeRecord | null {
  if (item.identity.objectType !== 'node' || item.identity.scope !== 'workspace' || item.base.kind !== 'node_version') {
    return null;
  }
  if (!item.payloadJson) return null;
  const record = JSON.parse(item.payloadJson) as NativeSyncNodeRecord;
  if (record.object_type !== 'node' || record.object_id !== item.identity.objectId || !record.version_id ||
      !record.device_id || !record.version_created_at || record.parent_version_id !== item.base.parentVersionId) {
    return null;
  }
  return {
    ...record,
    ancestor_version_ids: item.base.ancestorVersionIds,
    body_text: record.body_text ?? record.snapshot.content ?? '',
    content_hash: item.contentHash ?? record.content_hash,
    parent_version_ids: item.base.parentVersionIds ?? (item.base.parentVersionId ? [item.base.parentVersionId] : []),
    updated_at: item.updatedAt ?? record.updated_at
  };
}

export async function applyNodeVersionPushWithDbPort(
  port: DbPort,
  item: CompanionSyncPushPayload
): Promise<CompanionSyncPushResult> {
  const record = parseNodeVersionPush(item);
  if (!record) return rejectNodeVersionPush(item, 'invalid_node_push');
  const operation = await resolveNodeVersionPushOperation(port, record);
  const result = await applySyncNodesWithDbPort(port, [record], {
    enqueueSearchInvalidations: false,
    includeAlreadyApplied: true,
    ...(operation ? { operation } : {})
  });
  const accepted = result.appliedIds.includes(record.object_id);
  return {
    acks: [{
      clientOpId: item.clientOpId,
      ...(accepted ? {} : { conflictReason: 'node_version_conflict' }),
      identity: item.identity,
      status: accepted ? 'accepted' : 'conflict',
      versionId: record.version_id
    }],
    appliedNodeIds: result.appliedIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}

export async function resolveNodeVersionPushOperation(
  port: DbPort,
  record: NativeSyncNodeRecord
): Promise<SyncNodeApplyOperation | undefined> {
  const [local] = await port.query<{ current_version_id: unknown; deleted_at: unknown }>(
    `SELECT current_version_id, deleted_at FROM nodes WHERE id = ? LIMIT 1`,
    [record.object_id]
  );
  return local
    && typeof local.current_version_id === 'string'
    && typeof local.deleted_at === 'string'
    && record.snapshot.deleted_at === null
    && record.parent_version_id === local.current_version_id
    ? 'local_restore'
    : undefined;
}
