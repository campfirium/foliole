import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { mergeDesktopSyncGroupMembership } from '../database/syncGroupMembershipStore.js';

export const SYNC_GROUP_MEMBERSHIP_PATH = '/companion/sync-group/membership';

function parsePayload(bodyText: string) {
  const body = JSON.parse(bodyText) as { sync_group?: unknown };
  if (!body.sync_group || typeof body.sync_group !== 'object' || Array.isArray(body.sync_group)) {
    throw new Error('sync_group_membership_invalid');
  }
  const group = body.sync_group as SyncGroupPayload;
  if (!Array.isArray(group.members)) throw new Error('sync_group_membership_invalid');
  return group;
}

export function mergeSubmittedSyncGroupMembership(bodyText: string, submittedByDeviceId: string) {
  return mergeDesktopSyncGroupMembership({
    incomingGroup: parsePayload(bodyText),
    submittedByDeviceId
  });
}
