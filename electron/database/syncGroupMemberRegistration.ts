import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { allocateSyncGroupDeviceProfile } from '../../lib/platform/syncGroupDeviceProfile.js';

export function saveApprovedSyncGroupMember(args: {
  approvedByDeviceId: string;
  authorizationId: string;
  deviceKind: string;
  deviceName: string;
  groupId: string;
  now: string;
}, driver: DatabaseDriver) {
  const existing = driver.queryOne(
    `SELECT 1 FROM sync_group_members WHERE group_id = ? AND authorization_id = ? LIMIT 1`,
    [args.groupId, args.authorizationId]
  );
  if (existing) return;
  const occupiedNames = driver.queryAll<{ device_name: string }>(
    'SELECT device_name FROM sync_group_members WHERE group_id = ?', [args.groupId]
  ).map((member) => member.device_name);
  const assigned = allocateSyncGroupDeviceProfile(args.deviceName, occupiedNames);
  driver.execute(
    `INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)`,
    [args.groupId, assigned.device_id, args.deviceKind, assigned.device_name, args.approvedByDeviceId,
      args.authorizationId, args.now, args.now]
  );
}
