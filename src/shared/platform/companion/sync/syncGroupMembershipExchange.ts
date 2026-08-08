import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { createSignedRequestHeaders } from '../network/signedRequest';

import { loadCompanionSyncGroup, mergeActiveCompanionSyncGroupMembership } from './syncGroupStore';

export const SYNC_GROUP_MEMBERSHIP_PATH = '/companion/sync-group/membership';

export async function exchangeCompanionSyncGroupMembership(endpointUrl: string) {
  const group = await loadCompanionSyncGroup();
  if (!group || group.local_member_state !== 'active') return group;
  const body = JSON.stringify({ sync_group: group });
  const headers = await createSignedRequestHeaders({
    bodyText: body, endpointUrl, method: 'POST', pathWithQuery: SYNC_GROUP_MEMBERSHIP_PATH
  });
  const response = await FolioleCompanionSync.desktopHttpRequest({
    body, headers: { ...headers, 'Content-Type': 'application/json' }, method: 'POST',
    url: `${endpointUrl.replace(/\/+$/, '')}${SYNC_GROUP_MEMBERSHIP_PATH}`
  });
  if (response.status !== 200) throw new Error(readError(response.body));
  const payload = JSON.parse(response.body) as { sync_group?: SyncGroupPayload };
  if (!payload.sync_group) throw new Error('sync_group_membership_invalid');
  return mergeActiveCompanionSyncGroupMembership(payload.sync_group);
}

function readError(body: string) {
  try {
    const payload = JSON.parse(body) as { error?: string };
    return payload.error ?? 'sync_group_membership_failed';
  } catch {
    return 'sync_group_membership_failed';
  }
}
