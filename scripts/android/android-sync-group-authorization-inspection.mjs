import { createHash } from 'node:crypto';

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

export function authorizationFingerprint(value) {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
}

export function inspectLocalActiveDeviceIdentityFingerprint(database) {
  const required = {
    sync_groups: ['group_id'],
    sync_group_local_state: ['singleton_id', 'group_id', 'local_device_identity_key', 'state'],
    sync_group_devices: ['group_id', 'device_identity_key', 'state']
  };
  for (const [table, columns] of Object.entries(required)) {
    if (!tableExists(database, table)) return null;
    const statement = database.prepare(`PRAGMA table_info(${table})`);
    if (typeof statement.all !== 'function') return null;
    const actual = new Set(statement.all().map((column) => column.name));
    if (columns.some((column) => !actual.has(column))) return null;
  }
  const rows = database.prepare(`SELECT device.device_identity_key
    FROM sync_group_local_state local JOIN sync_groups groups ON groups.group_id = local.group_id
    JOIN sync_group_devices device ON device.group_id = local.group_id
      AND device.device_identity_key = local.local_device_identity_key
    WHERE local.singleton_id = 1 AND local.state = 'active'
      AND device.state = 'active' LIMIT 2`).all();
  const identity = rows.length === 1 ? rows[0].device_identity_key : null;
  return typeof identity === 'string' && identity.trim()
    ? authorizationFingerprint(identity) : null;
}
