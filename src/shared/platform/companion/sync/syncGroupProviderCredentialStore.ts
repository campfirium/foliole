import type { DbRow } from '../../../../../lib/core/sync/dbPort';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

export async function loadGroupPayload() {
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const group = (await db.query<DbRow>(
      `SELECT g.group_id, g.display_name, g.created_at, l.local_device_identity_key
       FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
       WHERE l.singleton_id = 1 AND l.state = 'active' LIMIT 1`
    ))[0];
    if (!group) throw new Error('sync_group_not_available');
    const devices = await db.query<DbRow>(
      `SELECT device_identity_key, device_anchor, canonical_library_path, device_name,
              platform, state, joined_at, left_at, last_seen_at, updated_at
       FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`,
      [requiredText(group.group_id)]
    );
    return { devices, group };
  });
}

export async function loadCurrentCredential(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const rows = await db.query<DbRow>(
      `SELECT l.local_device_identity_key AS device_id, g.workgroup_key
       FROM sync_group_local_state l JOIN sync_groups g ON g.group_id = l.group_id
       JOIN sync_group_devices d ON d.group_id = l.group_id
         AND d.device_identity_key = l.local_device_identity_key
       WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'
         AND l.group_id = ? LIMIT 2`, [groupId]
    );
    const row = rows[0];
    if (rows.length !== 1 || !row) throw new Error('sync_group_current_credential_missing');
    return { device_id: requiredText(row.device_id), workgroup_key: requiredText(row.workgroup_key) };
  });
}
