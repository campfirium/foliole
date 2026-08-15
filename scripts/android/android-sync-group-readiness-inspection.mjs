function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

function columnExists(database, table, column) {
  const statement = database.prepare(`PRAGMA table_info(${table})`);
  return typeof statement.all === 'function'
    && statement.all().some((entry) => entry.name === column);
}

export function inspectSyncGroupBinding(database, deviceId) {
  if (!tableExists(database, 'sync_groups')) return null;
  if (tableExists(database, 'sync_group_local_state')) {
    const local = database.prepare(`SELECT groups.group_id, groups.timeline_id
      FROM sync_group_local_state local JOIN sync_groups groups ON groups.group_id = local.group_id
      WHERE local.singleton_id = 1 LIMIT 1`).get();
    if (local) return local;
  }
  if (!deviceId || !tableExists(database, 'sync_group_members')) return null;
  const statement = database.prepare(`SELECT groups.group_id, groups.timeline_id
    FROM sync_group_members member JOIN sync_groups groups ON groups.group_id = member.group_id
    WHERE member.device_id = ? AND member.state = 'active' LIMIT 2`);
  if (typeof statement.all !== 'function') return null;
  const memberships = statement.all(deviceId);
  return memberships.length === 1 ? memberships[0] : null;
}

export function inspectStoredSyncGroup(database) {
  if (!tableExists(database, 'sync_groups')) return null;
  const statement = database.prepare('SELECT group_id, timeline_id FROM sync_groups LIMIT 2');
  if (typeof statement.all !== 'function') return null;
  const groups = statement.all();
  return groups.length === 1 ? groups[0] : null;
}

export function inspectWorkgroupKeyPresent(database) {
  if (!tableExists(database, 'sync_groups')
    || !columnExists(database, 'sync_groups', 'workgroup_key')) return false;
  return database.prepare(`SELECT 1 FROM sync_groups
    WHERE workgroup_key IS NOT NULL AND TRIM(workgroup_key) != '' LIMIT 1`).get() !== undefined;
}
