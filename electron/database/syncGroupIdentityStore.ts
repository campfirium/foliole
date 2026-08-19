import { isAssignedSyncGroupHostName } from '../../lib/platform/syncGroupDeviceProfile.js';

import { openDatabaseConnection } from './connection.js';
import { saveApprovedSyncGroupMember } from './syncGroupMemberRegistration.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

export function updateLocalSyncGroupHostName(hostName: string, now = new Date().toISOString()) {
  const group = loadDesktopSyncGroup();
  if (!group) return null;
  const local = group.members.find((member) => member.host_name === group.local_host_name);
  if (!local || isAssignedSyncGroupHostName(local.host_name, hostName)) return group;
  openDatabaseConnection().driver.transaction((driver) => saveApprovedSyncGroupMember({
    approvedByHostName: local.approved_by_host_name,
    authorizationId: local.authorization_id,
    groupId: group.group_id,
    hostName,
    hostPlatform: local.host_platform,
    now
  }, driver));
  return loadDesktopSyncGroup();
}
