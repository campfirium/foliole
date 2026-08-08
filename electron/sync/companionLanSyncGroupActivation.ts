import {
  isCompleteProvisioningSummary,
  type SyncGroupPayload
} from '../../lib/platform/syncGroupContract.js';
import { activateSyncGroupMember } from '../database/syncGroupStore.js';

export const SYNC_GROUP_ACTIVATE_PATH = '/companion/sync-group/activate';

export function activateProvisionedSyncGroupMember(bodyText: string, deviceId: string): SyncGroupPayload {
  const payload = JSON.parse(bodyText) as Record<string, unknown>;
  const summary = payload.completeness as Record<string, unknown> | undefined;
  if (!summary || !isCompleteProvisioningSummary({
    remainingAttachmentResourceCount: numberOrNull(summary.remaining_attachment_resource_count),
    remainingContentBlobCount: numberOrNull(summary.remaining_content_blob_count),
    remainingFailedAttachmentResourceCount: numberOrNull(summary.failed_attachment_resource_count),
    remainingFailedContentBlobCount: numberOrNull(summary.failed_content_blob_count),
    remainingStructureChangeCount: numberOrNull(summary.remaining_structure_change_count)
  })) throw new Error('sync_group_provisioning_incomplete');
  const completedCursor = Number(payload.completed_cursor);
  if (!Number.isSafeInteger(completedCursor) || completedCursor < 0) {
    throw new Error('sync_group_provisioning_cursor_invalid');
  }
  return activateSyncGroupMember({
    authorizationId: requiredString(payload.member_authorization_id),
    completedCursor,
    deviceId,
    groupId: requiredString(payload.group_id),
    timelineId: requiredString(payload.timeline_id)
  });
}

function numberOrNull(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function requiredString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_activation_invalid');
  return value.trim();
}
