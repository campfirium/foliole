import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';

function tableExists(database, table) {
  return database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).get(table) !== undefined;
}

function meta(database, key) {
  if (!tableExists(database, 'companion_meta')) return null;
  return database.prepare('SELECT value FROM companion_meta WHERE key = ? LIMIT 1')
    .get(key)?.value ?? null;
}

function all(database, sql, ...parameters) {
  const statement = database.prepare(sql);
  return typeof statement.all === 'function' ? statement.all(...parameters) : [];
}

function count(database, sql, ...parameters) {
  return Number(database.prepare(sql).get(...parameters)?.count ?? 0);
}

function currentGroupEvidence(database) {
  if (!tableExists(database, 'sync_group_local_state')
      || !tableExists(database, 'sync_groups')) {
    return { activeSyncGroupMemberCount: 0, syncGroupId: null, syncGroupTimelineId: null };
  }
  const rows = all(database, `SELECT groups.group_id, groups.timeline_id
    FROM sync_group_local_state local JOIN sync_groups groups ON groups.group_id = local.group_id
    WHERE local.singleton_id = 1 LIMIT 2`);
  if (rows.length !== 1) {
    return { activeSyncGroupMemberCount: 0, syncGroupId: null, syncGroupTimelineId: null };
  }
  const active = tableExists(database, 'sync_group_members')
    ? count(database, `SELECT COUNT(*) AS count FROM sync_group_members
      WHERE group_id = ? AND state = 'active'`, rows[0].group_id) : 0;
  return { activeSyncGroupMemberCount: active, syncGroupId: rows[0].group_id,
    syncGroupTimelineId: rows[0].timeline_id };
}

function emptyStoredEvidence(storedSyncGroupCount) {
  return {
    storedLocalDepartureAuthorizationFingerprint: null,
    storedLocalDepartureMatchCount: 0,
    storedLocalMemberAuthorizationFingerprint: null,
    storedSyncGroupCount,
    storedSyncGroupDepartureCount: 0,
    storedSyncGroupId: null,
    storedSyncGroupMemberCount: 0,
    storedSyncGroupTimelineId: null
  };
}

function storedGroupEvidence(database) {
  if (!tableExists(database, 'sync_groups')) return emptyStoredEvidence(0);
  const groups = all(database, 'SELECT group_id, timeline_id FROM sync_groups LIMIT 2');
  if (groups.length !== 1) return emptyStoredEvidence(groups.length);
  const group = groups[0];
  const members = tableExists(database, 'sync_group_members')
    ? count(database, 'SELECT COUNT(*) AS count FROM sync_group_members WHERE group_id = ?', group.group_id) : 0;
  const departures = tableExists(database, 'sync_group_member_departures')
    ? count(database, 'SELECT COUNT(*) AS count FROM sync_group_member_departures WHERE group_id = ?', group.group_id) : 0;
  const hostName = meta(database, 'host_name');
  const matches = hostName && members && departures ? all(database, `SELECT
      member.authorization_id AS member_authorization_id,
      departure.authorization_id AS departure_authorization_id
    FROM sync_group_members member JOIN sync_group_member_departures departure
      ON departure.group_id = member.group_id AND departure.host_name = member.host_name
    WHERE member.group_id = ? AND member.host_name = ? AND member.state = 'left'
      AND departure.authorized_by_host_name = member.host_name
      AND departure.left_at = member.left_at LIMIT 2`, group.group_id, hostName) : [];
  const match = matches.length === 1 ? matches[0] : null;
  return {
    storedLocalDepartureAuthorizationFingerprint:
      authorizationFingerprint(match?.departure_authorization_id),
    storedLocalDepartureMatchCount: matches.length,
    storedLocalMemberAuthorizationFingerprint:
      authorizationFingerprint(match?.member_authorization_id),
    storedSyncGroupCount: 1,
    storedSyncGroupDepartureCount: departures,
    storedSyncGroupId: group.group_id,
    storedSyncGroupMemberCount: members,
    storedSyncGroupTimelineId: group.timeline_id
  };
}

export function inspectDepartedHistory(database) {
  return { ...currentGroupEvidence(database), ...storedGroupEvidence(database),
    workspaceSyncEndpointPresent: Boolean(meta(database, 'workspace_sync_endpoint_url')) };
}

export function departedHistoryReadinessEvidence(inspection) {
  const source = inspection ?? {};
  return Object.fromEntries([
    'activeSyncGroupMemberCount', 'storedLocalDepartureAuthorizationFingerprint',
    'storedLocalDepartureMatchCount', 'storedLocalMemberAuthorizationFingerprint',
    'storedSyncGroupCount', 'storedSyncGroupDepartureCount', 'storedSyncGroupId',
    'storedSyncGroupMemberCount', 'storedSyncGroupTimelineId', 'syncGroupId',
    'syncGroupTimelineId', 'workspaceSyncEndpointPresent'
  ].map((key) => [key, source[key] ?? (key.endsWith('Count') ? 0 : null)]));
}
