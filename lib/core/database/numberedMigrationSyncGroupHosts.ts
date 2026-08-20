import { allocateSyncGroupHostName } from '../../platform/syncGroupDeviceProfile.js';

import { buildLegacyDeliveryAuthorizationAliases } from './deliveryAuthorizationMigrationModel.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { columnExists, tableExists } from './numberedMigrationHelpers.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from './syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

type Row = Record<string, unknown>;

export function migrateSyncGroupHosts(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'sync_group_members') ||
      !columnExists(sqlite, 'sync_group_members', 'device_id')) return;
  dropDeliveryTriggers(sqlite);
  const groups = rows(sqlite, 'sync_groups');
  const members = rows(sqlite, 'sync_group_members', 'joined_at, device_id');
  const locals = rows(sqlite, 'sync_group_local_state');
  const departures = tableExists(sqlite, 'sync_group_member_departures')
    ? rows(sqlite, 'sync_group_member_departures') : [];
  const hostNames = allocateHostNames(members);
  preserveDeliveryAliases(sqlite, members, hostNames);
  for (const table of ['sync_group_local_state', 'sync_group_member_departures',
    'sync_group_members', 'sync_groups']) sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  insertGroups(sqlite, groups, hostNames);
  insertMembers(sqlite, members, hostNames);
  insertLocals(sqlite, locals, hostNames);
  insertDepartures(sqlite, departures, hostNames);
  for (const statement of SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
}

function preserveDeliveryAliases(
  sqlite: DatabaseMigrationTarget, members: Row[], names: Map<string, string>
) {
  sqlite.exec('DROP TABLE IF EXISTS delivery_authorization_migration_aliases');
  sqlite.exec(`CREATE TABLE delivery_authorization_migration_aliases (
    group_id TEXT NOT NULL, peer_key TEXT NOT NULL, authorization_id TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_key, authorization_id))`);
  const insert = sqlite.prepare(`INSERT INTO delivery_authorization_migration_aliases
    (group_id, peer_key, authorization_id) VALUES (?, ?, ?)`);
  const aliases = buildLegacyDeliveryAuthorizationAliases(members.map((row) => ({
    ...row, host_name: mapped(names, row.group_id, row.device_id)
  })));
  for (const row of aliases) insert.run(row.group_id, row.peer_key, row.authorization_id);
}

function allocateHostNames(members: Row[]) {
  const result = new Map<string, string>();
  const occupied = new Map<string, string[]>();
  for (const member of members) {
    const groupId = text(member.group_id);
    const names = occupied.get(groupId) ?? [];
    const assigned = allocateSyncGroupHostName(
      text(member.device_name ?? member.device_id), names
    ).host_name;
    occupied.set(groupId, [...names, assigned]);
    result.set(key(groupId, member.device_id), assigned);
  }
  return result;
}

function insertGroups(sqlite: DatabaseMigrationTarget, groups: Row[], names: Map<string, string>) {
  const insert = sqlite.prepare(`INSERT INTO sync_groups (
    group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at, workgroup_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const row of groups) insert.run(
    row.group_id, row.display_name, row.timeline_id,
    mapped(names, row.group_id, row.created_by_device_id),
    row.created_at, row.updated_at, row.workgroup_key
  );
}

function insertMembers(sqlite: DatabaseMigrationTarget, members: Row[], names: Map<string, string>) {
  const insert = sqlite.prepare(`INSERT INTO sync_group_members (
    group_id, host_name, host_platform, state, approved_by_host_name, authorization_id,
    provisioning_cursor, joined_at, activated_at, left_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of members) insert.run(
    row.group_id, mapped(names, row.group_id, row.device_id), row.device_kind, row.state,
    mapped(names, row.group_id, row.approved_by_device_id), row.authorization_id,
    row.provisioning_cursor, row.joined_at, row.activated_at, row.left_at, row.updated_at
  );
}

function insertLocals(sqlite: DatabaseMigrationTarget, locals: Row[], names: Map<string, string>) {
  const insert = sqlite.prepare(`INSERT INTO sync_group_local_state (
    singleton_id, group_id, local_host_name, member_state, provisioning_cursor,
    created_empty_proof_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const row of locals) insert.run(
    row.singleton_id, row.group_id, mapped(names, row.group_id, row.local_device_id),
    row.member_state, row.provisioning_cursor, row.created_empty_proof_json, row.updated_at
  );
}

function insertDepartures(sqlite: DatabaseMigrationTarget, departures: Row[], names: Map<string, string>) {
  const insert = sqlite.prepare(`INSERT INTO sync_group_member_departures (
    group_id, host_name, authorized_by_host_name, authorization_id, left_at
  ) VALUES (?, ?, ?, ?, ?)`);
  for (const row of departures) insert.run(
    row.group_id, mapped(names, row.group_id, row.device_id),
    mapped(names, row.group_id, row.authorized_by_device_id), row.authorization_id, row.left_at
  );
}

function rows(sqlite: DatabaseMigrationTarget, table: string, order = 'rowid') {
  return sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all() as Row[];
}

function mapped(names: Map<string, string>, groupId: unknown, deviceId: unknown) {
  return names.get(key(groupId, deviceId)) ?? text(deviceId);
}

function key(groupId: unknown, deviceId: unknown) {
  return `${text(groupId)}\u0000${text(deviceId)}`;
}

function text(value: unknown) {
  return String(value ?? '');
}

function dropDeliveryTriggers(sqlite: DatabaseMigrationTarget) {
  for (const name of ['trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
    'trg_sync_delivery_member_leave', 'trg_sync_delivery_review_insert']) {
    sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  }
}
