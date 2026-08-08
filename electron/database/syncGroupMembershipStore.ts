import { mergeSyncGroupMemberFacts } from '../../lib/core/sync/syncGroupMemberMerge.js';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

function assertSameGroup(current: SyncGroupPayload, incoming: SyncGroupPayload) {
  const identity = ['created_at', 'created_by_device_id', 'display_name', 'group_id', 'timeline_id'] as const;
  if (identity.some((field) => current[field] !== incoming[field])) {
    throw new Error('sync_group_identity_mismatch');
  }
}

function saveMember(groupId: string, member: SyncGroupPayload['members'][number], now: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(group_id, device_id) DO UPDATE SET
      state = excluded.state,
      activated_at = excluded.activated_at,
      left_at = excluded.left_at,
      updated_at = excluded.updated_at`,
    [groupId, member.device_id, member.device_kind, member.device_name, member.state,
      member.approved_by_device_id, member.authorization_id, member.joined_at, member.activated_at,
      member.state === 'left' ? now : null, now]
  );
}

export function mergeDesktopSyncGroupMembership(args: {
  incomingGroup: SyncGroupPayload;
  submittedByDeviceId: string;
  now?: string;
}) {
  const current = loadDesktopSyncGroup();
  if (!current || current.local_member_state !== 'active') throw new Error('sync_group_not_available');
  assertSameGroup(current, args.incomingGroup);
  if (args.incomingGroup.local_device_id !== args.submittedByDeviceId
    || args.incomingGroup.local_member_state !== 'active') {
    throw new Error('sync_group_submitter_identity_mismatch');
  }
  const members = mergeSyncGroupMemberFacts({
    currentMembers: current.members,
    incomingMembers: args.incomingGroup.members,
    submittedByDeviceId: args.submittedByDeviceId
  });
  const now = args.now ?? new Date().toISOString();
  openDatabaseConnection().driver.transaction(() => {
    for (const member of members) saveMember(current.group_id, member, now);
  });
  return loadDesktopSyncGroup()!;
}
