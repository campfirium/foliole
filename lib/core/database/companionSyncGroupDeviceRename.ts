import type { DbPort } from '../sync/dbPort.js';

interface LocalDeviceRow extends Record<string, unknown> {
  device_identity_key: string;
  device_name: string;
  group_id: string;
  updated_at: string;
}

export async function renameCompanionLocalSyncGroupDevice(
  db: DbPort,
  requestedDeviceName: string,
  now: string
) {
  const [local] = await db.query<LocalDeviceRow>(`SELECT d.group_id, d.device_identity_key,
      d.device_name, d.updated_at
    FROM sync_group_local_state l
    JOIN sync_group_devices d
      ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
    WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active' LIMIT 1`);
  if (!local || local.device_name === requestedDeviceName || String(local.updated_at) >= now) return;
  await db.run(`UPDATE sync_group_devices SET device_name = ?, updated_at = ?
    WHERE group_id = ? AND device_identity_key = ? AND state = 'active'`,
  [requestedDeviceName, now, local.group_id, local.device_identity_key]);
}
