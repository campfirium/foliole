import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { allocateSyncGroupDeviceProfile } from '../../lib/platform/syncGroupDeviceProfile.js';

export function saveApprovedSyncGroupMember(args: {
  approvedByDeviceId: string;
  authorizationId: string;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  groupId: string;
  now: string;
}, driver: DatabaseDriver) {
  const active = driver.queryOne<{ device_kind: string; device_name: string }>(
    `SELECT device_kind, device_name FROM sync_group_members
     WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`,
    [args.groupId, args.deviceId]
  );
  if (active?.device_name === args.deviceName && active.device_kind === args.deviceKind) return;
  const existing = driver.queryOne(
    `SELECT 1 FROM sync_group_members WHERE group_id = ? AND authorization_id = ? LIMIT 1`,
    [args.groupId, args.authorizationId]
  );
  if (existing) return;
  const occupiedNames = driver.queryAll<{ device_name: string }>(
    `SELECT device_name FROM sync_group_members
     WHERE group_id = ? AND state = 'active'`, [args.groupId]
  ).map((member) => member.device_name);
  const assigned = allocateSyncGroupDeviceProfile(args.deviceName, occupiedNames);
  driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
    ON CONFLICT(group_id, device_id) DO UPDATE SET
      device_kind = excluded.device_kind,
      device_name = excluded.device_name,
      state = 'active',
      approved_by_device_id = excluded.approved_by_device_id,
      authorization_id = excluded.authorization_id,
      provisioning_cursor = NULL,
      joined_at = excluded.joined_at,
      activated_at = NULL,
      left_at = NULL,
      updated_at = excluded.updated_at
    WHERE sync_group_members.state = 'left'
      AND excluded.joined_at > sync_group_members.joined_at`,
    [args.groupId, assigned.device_id, args.deviceKind, assigned.device_name, args.approvedByDeviceId,
      args.authorizationId, args.now, args.now]
  );
  driver.execute(
    `DELETE FROM sync_group_member_departures
     WHERE group_id = ? AND device_id = ? AND left_at < ?`,
    [args.groupId, assigned.device_id, args.now]
  );
}
