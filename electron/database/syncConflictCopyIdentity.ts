import { createHash } from 'node:crypto';

import { CONFLICT_COPY_NODE_ID_PREFIX, isConflictCopyNodeId } from '../../lib/core/sync/syncNodeApplyRules.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

function hashId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function conflictCopyBranchKey(record: NativeSyncNodeRecord) {
  return {
    objectId: record.object_id,
    sourceDeviceId: record.device_id?.trim() || 'remote'
  };
}

export function conflictCopyNodeId(record: NativeSyncNodeRecord) {
  const key = conflictCopyBranchKey(record);
  return `${CONFLICT_COPY_NODE_ID_PREFIX}${hashId(`${key.objectId}\n${key.sourceDeviceId}`)}`;
}

export function conflictCopyVersionId(deviceId: string, copyNodeId: string, sourceVersionId: string) {
  return `${deviceId}#${copyNodeId}:${hashId(sourceVersionId)}`;
}

export { isConflictCopyNodeId };

export function conflictCopyTitle(record: NativeSyncNodeRecord) {
  const title = baseConflictCopyTitle(record.snapshot.title);
  return `${title} (conflict copy - ${conflictCopySourceLabel(record.device_id)})`;
}

function baseConflictCopyTitle(title: string | null | undefined) {
  const baseTitle = title?.trim() || 'Untitled';
  const stripped = baseTitle.replace(/(?:\s+\(conflict copy - [^)]+\))+$/giu, '').trim();
  return stripped || 'Untitled';
}

function conflictCopySourceLabel(deviceId: string | null | undefined) {
  const source = deviceId?.trim().toLowerCase() ?? '';
  if (source.startsWith('android') || source === 'phone') {
    return 'Android';
  }
  if (source.startsWith('desktop') || source === 'windows') {
    return 'Desktop';
  }
  return 'Remote';
}
