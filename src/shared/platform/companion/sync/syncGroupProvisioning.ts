import { isCompleteProvisioningSummary, type SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { loadCompanionDesktopSyncSummary } from '../../companionDesktopSyncSummary';
import { loadCompanionSyncPackCursor } from '../../companionSyncCursors';
import { FolioleCompanionSync, isAvailableNativeAndroidCompanionRuntime } from '../../companionWorkspaceRuntimeRepository';
import { createSignedRequestHeaders } from '../network/signedRequest';

import { activateCompanionSyncGroup, loadCompanionSyncGroup } from './syncGroupStore';

const ACTIVATE_PATH = '/companion/sync-group/activate';

export async function activateCompanionSyncGroupIfComplete(endpointUrl: string) {
  if (!isAvailableNativeAndroidCompanionRuntime()) return null;
  const group = await loadCompanionSyncGroup();
  if (!group || group.local_member_state !== 'provisioning') return group;
  const summary = await loadCompanionDesktopSyncSummary(endpointUrl);
  if (!isCompleteProvisioningSummary(summary)) return group;
  const completedCursor = await loadCompanionSyncPackCursor();
  if (completedCursor === null) return group;
  const member = group.members.find((candidate) => candidate.device_id === group.local_device_id);
  if (!member) throw new Error('sync_group_member_not_authorized');
  const body = JSON.stringify({
    completed_cursor: completedCursor,
    completeness: {
      failed_attachment_resource_count: summary.remainingFailedAttachmentResourceCount,
      failed_content_blob_count: summary.remainingFailedContentBlobCount,
      remaining_attachment_resource_count: summary.remainingAttachmentResourceCount,
      remaining_content_blob_count: summary.remainingContentBlobCount,
      remaining_structure_change_count: summary.remainingStructureChangeCount
    },
    group_id: group.group_id,
    member_authorization_id: member.authorization_id,
    timeline_id: group.timeline_id
  });
  const headers = await createSignedRequestHeaders({ bodyText: body, method: 'POST', pathWithQuery: ACTIVATE_PATH });
  const response = await FolioleCompanionSync.desktopHttpRequest({
    body, headers: { ...headers, 'Content-Type': 'application/json' }, method: 'POST',
    url: `${endpointUrl.replace(/\/+$/, '')}${ACTIVATE_PATH}`
  });
  if (response.status !== 200) throw new Error(readActivationError(response.body));
  const payload = JSON.parse(response.body) as { sync_group?: SyncGroupPayload };
  if (!payload.sync_group) throw new Error('sync_group_activation_invalid');
  return activateCompanionSyncGroup(payload.sync_group);
}

export async function rollbackIncompleteCompanionSyncGroup() {
  if (!isAvailableNativeAndroidCompanionRuntime()) return false;
  const group = await loadCompanionSyncGroup().catch(() => null);
  if (group?.local_member_state !== 'provisioning') return false;
  const { clearCompanionAppData } = await import('../../companionAppData');
  await clearCompanionAppData();
  return true;
}

function readActivationError(body: string) {
  try {
    const payload = JSON.parse(body) as { error?: string };
    return payload.error ?? 'sync_group_activation_failed';
  } catch {
    return 'sync_group_activation_failed';
  }
}
