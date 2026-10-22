function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

/** Read the active sync group and local device identity from a pulled companion database. */
export function inspectProtectionIdentity(database) {
  if (!tableExists(database, 'sync_groups')
      || !tableExists(database, 'sync_group_local_state')) {
    return { activeSyncGroupId: null, localDeviceIdentityKey: null };
  }
  const row = database.prepare(`SELECT groups.group_id, local.local_device_identity_key
    FROM sync_group_local_state local JOIN sync_groups groups ON groups.group_id = local.group_id
    WHERE local.singleton_id = 1 AND local.state = 'active' LIMIT 1`).get();
  return { activeSyncGroupId: row?.group_id ?? null,
    localDeviceIdentityKey: row?.local_device_identity_key ?? null };
}
