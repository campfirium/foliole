import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { allocateSyncGroupHostName } from '../../lib/platform/syncGroupDeviceProfile.js';

export function saveApprovedSyncGroupMember(args: {
  approvedByHostName: string;
  authorizationId: string;
  hostName: string;
  hostPlatform: string;
  groupId: string;
  now: string;
}, driver: DatabaseDriver) {
  const active = driver.queryOne<{ authorization_id: string; host_platform: string }>(
    `SELECT authorization_id, host_platform FROM sync_group_members
     WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`,
    [args.groupId, args.hostName]
  );
  if (active?.authorization_id === args.authorizationId && active.host_platform === args.hostPlatform) return;
  const existing = driver.queryOne<{ host_name: string; updated_at: string }>(
    `SELECT host_name, updated_at FROM sync_group_members
     WHERE group_id = ? AND authorization_id = ? LIMIT 1`,
    [args.groupId, args.authorizationId]
  );
  if (existing) {
    if (existing.host_name !== args.hostName && existing.updated_at >= args.now) return;
    renameAuthorizedHost(driver, args.groupId, existing.host_name, args.hostName, args.hostPlatform, args.now);
    return;
  }
  const occupiedNames = driver.queryAll<{ host_name: string }>(
    `SELECT host_name FROM sync_group_members
     WHERE group_id = ? AND state = 'active'`, [args.groupId]
  ).map((member) => member.host_name);
  const assigned = allocateSyncGroupHostName(args.hostName, occupiedNames);
  driver.execute(
    `INSERT INTO sync_group_members (
      group_id, host_name, host_platform, state, approved_by_host_name,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
    ON CONFLICT(group_id, host_name) DO UPDATE SET
      host_platform = excluded.host_platform,
      state = 'active',
      approved_by_host_name = excluded.approved_by_host_name,
      authorization_id = excluded.authorization_id,
      provisioning_cursor = NULL,
      joined_at = excluded.joined_at,
      activated_at = NULL,
      left_at = NULL,
      updated_at = excluded.updated_at
    WHERE sync_group_members.state = 'left'
      AND excluded.joined_at > sync_group_members.joined_at`,
    [args.groupId, assigned.host_name, args.hostPlatform, args.approvedByHostName,
      args.authorizationId, args.now, args.now]
  );
  driver.execute(
    `DELETE FROM sync_group_member_departures
     WHERE group_id = ? AND host_name = ? AND left_at < ?`,
    [args.groupId, assigned.host_name, args.now]
  );
}

function renameAuthorizedHost(
  driver: DatabaseDriver,
  groupId: string,
  previousHostName: string,
  requestedHostName: string,
  hostPlatform: string,
  now: string
) {
  if (previousHostName === requestedHostName) return;
  const occupied = driver.queryAll<{ host_name: string }>(
    `SELECT host_name FROM sync_group_members
     WHERE group_id = ? AND state = 'active' AND host_name <> ?`, [groupId, previousHostName]
  ).map((row) => row.host_name);
  const nextHostName = allocateSyncGroupHostName(requestedHostName, occupied).host_name;
  driver.execute(`DELETE FROM sync_group_member_departures
    WHERE group_id = ? AND host_name = ? AND left_at < ?`, [groupId, nextHostName, now]);
  driver.execute(`DELETE FROM sync_group_members
    WHERE group_id = ? AND host_name = ? AND state = 'left' AND updated_at < ?`,
  [groupId, nextHostName, now]);
  driver.execute('UPDATE sync_groups SET created_by_host_name = ? WHERE group_id = ? AND created_by_host_name = ?',
    [nextHostName, groupId, previousHostName]);
  driver.execute('UPDATE sync_group_members SET approved_by_host_name = ? WHERE group_id = ? AND approved_by_host_name = ?',
    [nextHostName, groupId, previousHostName]);
  driver.execute('UPDATE sync_group_local_state SET local_host_name = ? WHERE group_id = ? AND local_host_name = ?',
    [nextHostName, groupId, previousHostName]);
  driver.execute(
    `UPDATE sync_group_members SET host_name = ?, host_platform = ?, state = 'active',
       left_at = NULL, updated_at = ?
     WHERE group_id = ? AND host_name = ?`,
    [nextHostName, hostPlatform, now, groupId, previousHostName]
  );
}
