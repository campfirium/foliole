import type {
  NativeSyncNodeRecord
} from '../../lib/platform/nativeSyncContract.js';

import type { CompanionSyncPushPayload, CompanionSyncPushResult } from './companionSyncPushApply.js';
import { applySyncNodes, applySyncNodesAsync } from './syncApply.js';

function rejectNodeVersionPush(item: CompanionSyncPushPayload, reason: string): CompanionSyncPushResult {
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

function parseNodeRecord(item: CompanionSyncPushPayload): NativeSyncNodeRecord | null {
  if (item.identity.objectType !== 'node' || item.identity.scope !== 'workspace' || item.base.kind !== 'node_version') {
    return null;
  }
  if (!item.payloadJson) {
    return null;
  }
  const record = JSON.parse(item.payloadJson) as NativeSyncNodeRecord;
  if (
    record.object_type !== 'node'
    || record.object_id !== item.identity.objectId
    || !record.version_id
    || !record.device_id
    || !record.version_created_at
    || record.parent_version_id !== item.base.parentVersionId
  ) {
    return null;
  }
  return {
    ...record,
    ancestor_version_ids: item.base.ancestorVersionIds,
    content_hash: item.contentHash ?? record.content_hash,
    updated_at: item.updatedAt ?? record.updated_at
  };
}

export function applyNodeVersionPush(item: CompanionSyncPushPayload): CompanionSyncPushResult {
  const record = parseNodeRecord(item);
  if (!record) {
    return rejectNodeVersionPush(item, 'invalid_node_push');
  }
  const appliedNodeIds = applySyncNodes([record], { includeAlreadyApplied: true });
  return {
    acks: [{
      clientOpId: item.clientOpId,
      conflictReason: appliedNodeIds.includes(record.object_id) ? undefined : 'node_version_conflict',
      identity: item.identity,
      status: appliedNodeIds.includes(record.object_id) ? 'accepted' : 'conflict',
      versionId: record.version_id
    }],
    appliedNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}

export async function applyNodeVersionPushAsync(item: CompanionSyncPushPayload): Promise<CompanionSyncPushResult> {
  const record = parseNodeRecord(item);
  if (!record) {
    return rejectNodeVersionPush(item, 'invalid_node_push');
  }
  const appliedNodeIds = await applySyncNodesAsync([record], { includeAlreadyApplied: true });
  return {
    acks: [{
      clientOpId: item.clientOpId,
      conflictReason: appliedNodeIds.includes(record.object_id) ? undefined : 'node_version_conflict',
      identity: item.identity,
      status: appliedNodeIds.includes(record.object_id) ? 'accepted' : 'conflict',
      versionId: record.version_id
    }],
    appliedNodeIds,
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}
