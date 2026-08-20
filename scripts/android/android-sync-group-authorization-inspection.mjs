import { createHash } from 'node:crypto';

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

export function authorizationFingerprint(value) {
  return value ? createHash('sha256').update(value).digest('hex').slice(0, 16) : null;
}

export function inspectLocalActiveMemberAuthorizationFingerprint(database) {
  if (!tableExists(database, 'sync_group_local_state')
      || !tableExists(database, 'sync_group_members')) return null;
  const statement = database.prepare(`SELECT member.authorization_id
    FROM sync_group_local_state local JOIN sync_group_members member
      ON member.group_id = local.group_id AND member.host_name = local.local_host_name
    WHERE local.singleton_id = 1 AND local.member_state = 'active'
      AND member.state = 'active' LIMIT 2`);
  if (typeof statement.all !== 'function') return null;
  const rows = statement.all();
  return rows.length === 1 ? authorizationFingerprint(rows[0].authorization_id) : null;
}
