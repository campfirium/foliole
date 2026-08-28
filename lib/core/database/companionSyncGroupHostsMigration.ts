import { allocateSyncGroupHostName } from '../../platform/syncGroupDeviceProfile.js';
import type { DbPort, DbRow, DbValue } from '../sync/dbPort.js';

import { buildLegacyDeliveryAuthorizationAliases } from './deliveryAuthorizationMigrationModel.js';
import {
  LEGACY_HOST_SYNC_DELIVERY_TRIGGER_STATEMENTS,
  LEGACY_HOST_SYNC_GROUP_SCHEMA_STATEMENTS
} from './legacyHostSyncGroupSchemaStatements.js';

export async function migrateCompanionSyncGroupHosts(db: DbPort) {
  if (!(await columnPresent(db, 'sync_group_members', 'device_id'))) return;
  await dropDeliveryTriggers(db);
  const groups = await rows(db, 'sync_groups');
  const members = await rows(db, 'sync_group_members', 'joined_at, device_id');
  const locals = await rows(db, 'sync_group_local_state');
  const departures = await rowsIfPresent(db, 'sync_group_member_departures');
  const hostNames = allocateHostNames(members);
  await preserveDeliveryAliases(db, members, hostNames);
  for (const table of ['sync_group_local_state', 'sync_group_member_departures',
    'sync_group_members', 'sync_groups']) await db.run(`DROP TABLE IF EXISTS ${table}`);
  for (const statement of LEGACY_HOST_SYNC_GROUP_SCHEMA_STATEMENTS) await db.run(statement);
  await insertGroups(db, groups, hostNames);
  await insertMembers(db, members, hostNames);
  await insertLocals(db, locals, hostNames);
  await insertDepartures(db, departures, hostNames);
  for (const statement of LEGACY_HOST_SYNC_DELIVERY_TRIGGER_STATEMENTS) {
    if (statement.includes(' ON sync_object_state') && !(await tablePresent(db, 'sync_object_state'))) continue;
    if (statement.includes(' ON review_log') && !(await tablePresent(db, 'review_log'))) continue;
    await db.run(statement);
  }
}

async function preserveDeliveryAliases(db: DbPort, members: DbRow[], names: Map<string, string>) {
  await db.run('DROP TABLE IF EXISTS delivery_authorization_migration_aliases');
  await db.run(`CREATE TABLE delivery_authorization_migration_aliases (
    group_id TEXT NOT NULL, peer_key TEXT NOT NULL, authorization_id TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_key, authorization_id))`);
  const aliases = buildLegacyDeliveryAuthorizationAliases(members.map((row) => ({
    ...row, host_name: mapped(names, row.group_id, row.device_id)
  })));
  for (const row of aliases) await db.run(`INSERT INTO delivery_authorization_migration_aliases
    (group_id, peer_key, authorization_id) VALUES (?, ?, ?)`,
  values(row.group_id, row.peer_key, row.authorization_id));
}

function allocateHostNames(members: DbRow[]) {
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

async function insertGroups(db: DbPort, groups: DbRow[], names: Map<string, string>) {
  for (const row of groups) await db.run(`INSERT INTO sync_groups (
    group_id, display_name, timeline_id, created_by_host_name, created_at, updated_at, workgroup_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`, values(
    row.group_id, row.display_name, row.timeline_id,
    mapped(names, row.group_id, row.created_by_device_id),
    row.created_at, row.updated_at, row.workgroup_key
  ));
}

async function insertMembers(db: DbPort, members: DbRow[], names: Map<string, string>) {
  for (const row of members) await db.run(`INSERT INTO sync_group_members (
    group_id, host_name, host_platform, state, approved_by_host_name, authorization_id,
    provisioning_cursor, joined_at, activated_at, left_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values(
    row.group_id, mapped(names, row.group_id, row.device_id), row.device_kind, row.state,
    mapped(names, row.group_id, row.approved_by_device_id), row.authorization_id,
    row.provisioning_cursor, row.joined_at, row.activated_at, row.left_at, row.updated_at
  ));
}

async function insertLocals(db: DbPort, locals: DbRow[], names: Map<string, string>) {
  for (const row of locals) await db.run(`INSERT INTO sync_group_local_state (
    singleton_id, group_id, local_host_name, member_state, provisioning_cursor,
    created_empty_proof_json, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`, values(
    row.singleton_id, row.group_id, mapped(names, row.group_id, row.local_device_id),
    row.member_state, row.provisioning_cursor, row.created_empty_proof_json, row.updated_at
  ));
}

async function insertDepartures(db: DbPort, rows: DbRow[], names: Map<string, string>) {
  for (const row of rows) await db.run(`INSERT INTO sync_group_member_departures (
    group_id, host_name, authorized_by_host_name, authorization_id, left_at
  ) VALUES (?, ?, ?, ?, ?)`, values(
    row.group_id, mapped(names, row.group_id, row.device_id),
    mapped(names, row.group_id, row.authorized_by_device_id), row.authorization_id, row.left_at
  ));
}

async function rows(db: DbPort, table: string, order = 'rowid') {
  return db.query<DbRow>(`SELECT * FROM ${table} ORDER BY ${order}`);
}

async function rowsIfPresent(db: DbPort, table: string) {
  return await tablePresent(db, table) ? rows(db, table) : [];
}

async function tablePresent(db: DbPort, table: string) {
  return (await db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])).length > 0;
}

async function columnPresent(db: DbPort, table: string, column: string) {
  if (!(await tablePresent(db, table))) return false;
  return (await db.query(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`, [column])).length > 0;
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

function values(...items: unknown[]) {
  return items as DbValue[];
}

async function dropDeliveryTriggers(db: DbPort) {
  for (const name of ['trg_sync_delivery_state_insert', 'trg_sync_delivery_state_update',
    'trg_sync_delivery_member_leave', 'trg_sync_delivery_review_insert']) {
    await db.run(`DROP TRIGGER IF EXISTS ${name}`);
  }
}
