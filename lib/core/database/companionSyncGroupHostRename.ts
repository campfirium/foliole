import { allocateSyncGroupHostName } from '../../platform/syncGroupDeviceProfile.js';
import type { DbPort } from '../sync/dbPort.js';

interface LocalMemberRow extends Record<string, unknown> {
  approved_by_host_name: string;
  authorization_id: string;
  group_id: string;
  host_name: string;
  host_platform: string;
  updated_at: string;
}

export async function renameCompanionLocalSyncGroupHost(
  db: DbPort,
  requestedHostName: string,
  now: string
) {
  const [local] = await db.query<LocalMemberRow>(`SELECT m.group_id, m.host_name, m.host_platform,
      m.authorization_id, m.updated_at
    FROM sync_group_local_state l
    JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
    WHERE l.singleton_id = 1 AND m.state = 'active' LIMIT 1`);
  if (!local || local.host_name === requestedHostName || String(local.updated_at) >= now) return;
  const occupied = await db.query<{ host_name: string }>(`SELECT host_name FROM sync_group_members
    WHERE group_id = ? AND state = 'active' AND host_name <> ?`, [local.group_id, local.host_name]);
  const nextHostName = allocateSyncGroupHostName(
    requestedHostName,
    occupied.map((row) => row.host_name)
  ).host_name;
  await db.run(`INSERT INTO sync_group_member_departures (
    group_id, host_name, authorized_by_host_name, authorization_id, left_at
  ) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(authorization_id) DO UPDATE SET host_name = excluded.host_name,
    authorized_by_host_name = excluded.authorized_by_host_name, left_at = excluded.left_at`,
  [local.group_id, local.host_name, nextHostName, local.authorization_id, now]);
  await db.run(`UPDATE sync_groups SET created_by_host_name = ?
    WHERE group_id = ? AND created_by_host_name = ?`, [nextHostName, local.group_id, local.host_name]);
  await db.run(`UPDATE sync_group_members SET approved_by_host_name = ?
    WHERE group_id = ? AND approved_by_host_name = ?`, [nextHostName, local.group_id, local.host_name]);
  await db.run(`UPDATE sync_group_local_state SET local_host_name = ?
    WHERE group_id = ? AND local_host_name = ?`, [nextHostName, local.group_id, local.host_name]);
  await db.run(`UPDATE sync_group_members SET host_name = ?, host_platform = ?,
      state = 'active', left_at = NULL, updated_at = ?
    WHERE group_id = ? AND host_name = ?`,
  [nextHostName, local.host_platform, now, local.group_id, local.host_name]);
}
