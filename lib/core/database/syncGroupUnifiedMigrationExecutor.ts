import type {
  LegacyUnifiedGroupSnapshot,
  LegacyUnifiedLibrarySnapshot,
  UnifiedMigrationLibraryDecision
} from '../../platform/syncGroupUnifiedContract.js';
import { UNIFIED_MIGRATION_CONTRACT_VERSION } from '../../platform/syncGroupUnifiedContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import {
  LEGACY_SYNC_GROUP_TABLES,
  UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS,
  UNIFIED_SYNC_GROUP_TABLES_IN_DROP_ORDER,
  unifiedLegacyTableName
} from './syncGroupUnifiedSchemaStatements.js';

interface LegacyGroupRow extends DbRow {
  created_at: string;
  created_by_host_name: string;
  display_name: string;
  group_id: string;
  timeline_id: string;
}

interface LegacyMemberRow extends DbRow {
  authorization_id: string;
  group_id: string;
  host_name: string;
  host_platform: string;
  joined_at: string;
  state: 'active' | 'left' | 'provisioning';
}

export interface ApplyUnifiedLibraryMigrationInput {
  decision_digest: string;
  journal_id: string;
  legacy_version: number;
  library: UnifiedMigrationLibraryDecision;
  now: string;
  target_version: number;
}

export async function readLegacyUnifiedLibrarySnapshot(
  db: DbPort,
  libraryId: string
): Promise<LegacyUnifiedLibrarySnapshot> {
  const userVersion = await readUserVersion(db);
  const [groups, members, local] = await Promise.all([
    db.query<LegacyGroupRow>(`SELECT group_id, display_name, timeline_id,
      created_by_host_name, created_at FROM sync_groups ORDER BY group_id`),
    db.query<LegacyMemberRow>(`SELECT group_id, host_name, host_platform, state,
      authorization_id, joined_at FROM sync_group_members ORDER BY group_id, host_name`),
    db.query<{ group_id: string }>('SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1')
  ]);
  return {
    groups: groups.map((group) => legacyGroup(group, members)),
    library_id: libraryId,
    singleton_group_id: local[0]?.group_id ?? null,
    user_version: userVersion
  };
}

export async function applyUnifiedLibraryMigration(db: DbPort, input: ApplyUnifiedLibraryMigrationInput) {
  validateVersion(input.legacy_version);
  validateVersion(input.target_version);
  await db.transaction(async (tx) => {
    const version = await readUserVersion(tx);
    if (version !== input.legacy_version) {
      throw new Error(`unified migration expected schema ${input.legacy_version}, received ${version}`);
    }
    await sealLegacyTables(tx, input.legacy_version);
    for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) await tx.run(statement);
    await insertDecision(tx, input);
    await tx.run(`INSERT INTO sync_group_migration_journal
      (journal_id, contract_version, legacy_schema_version, target_schema_version,
       decision_digest, phase, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'db_committed', ?, ?)`, [
      input.journal_id, UNIFIED_MIGRATION_CONTRACT_VERSION, input.legacy_version,
      input.target_version, input.decision_digest, input.now, input.now
    ]);
    await tx.run(`PRAGMA user_version = ${input.target_version}`);
  });
}

export async function markUnifiedLibraryMigrationCommitted(db: DbPort, journalId: string, now: string) {
  const result = await db.run(`UPDATE sync_group_migration_journal
    SET phase = 'committed', updated_at = ? WHERE journal_id = ? AND phase = 'db_committed'`, [now, journalId]);
  if (result.changes !== 1) throw new Error('unified migration database journal could not commit');
}

export async function rollbackUnifiedLibraryMigration(db: DbPort, expectedJournalId?: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ journal_id: string; legacy_schema_version: number }>(
      'SELECT journal_id, legacy_schema_version FROM sync_group_migration_journal LIMIT 1'
    );
    const journal = rows[0];
    if (!journal || expectedJournalId && journal.journal_id !== expectedJournalId) {
      throw new Error('unified migration rollback journal mismatch');
    }
    for (const table of UNIFIED_SYNC_GROUP_TABLES_IN_DROP_ORDER) {
      await tx.run(`DROP TABLE IF EXISTS ${table}`);
    }
    for (const table of LEGACY_SYNC_GROUP_TABLES) {
      const sealed = unifiedLegacyTableName(table, journal.legacy_schema_version);
      if (!await tableExists(tx, sealed)) throw new Error(`sealed legacy table missing: ${sealed}`);
      await tx.run(`ALTER TABLE ${sealed} RENAME TO ${table}`);
    }
    await tx.run(`PRAGMA user_version = ${journal.legacy_schema_version}`);
  });
}

async function sealLegacyTables(db: DbPort, version: number) {
  for (const table of LEGACY_SYNC_GROUP_TABLES) {
    const sealed = unifiedLegacyTableName(table, version);
    if (!await tableExists(db, table) || await tableExists(db, sealed)) {
      throw new Error(`legacy sync group table cannot be sealed: ${table}`);
    }
    await db.run(`ALTER TABLE ${table} RENAME TO ${sealed}`);
  }
}

async function insertDecision(db: DbPort, input: ApplyUnifiedLibraryMigrationInput) {
  const decision = input.library;
  if (!decision.group_id || !decision.timeline_id) return;
  const managerId = decision.manager_member_id ?? `legacy-manager-repair:${decision.group_id}`;
  await db.run(`INSERT INTO sync_groups
    (group_id, timeline_id, display_name, manager_member_id, roster_revision, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    decision.group_id, decision.timeline_id, decision.group_display_name ?? decision.group_id,
    managerId, decision.roster_revision, decision.binding_state === 'repair' ? 'repair' : 'active',
    decision.group_created_at ?? input.now, input.now
  ]);
  for (const member of decision.members) {
    await db.run(`INSERT INTO sync_group_members
      (group_id, member_id, installation_id, display_name, host_platform, role, state,
       identity_state, authorization_id, authorization_epoch, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      decision.group_id, member.member_id, member.installation_id, member.display_name, member.platform,
      member.role, member.state, member.identity_state, member.authorization_id,
      member.authorization_epoch, decision.group_created_at ?? input.now, input.now
    ]);
    await db.run(`INSERT INTO sync_group_member_authorizations
      (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [decision.group_id, member.member_id, member.authorization_id,
      member.authorization_epoch, member.state === 'repair' ? 'repair' : member.state, input.now]);
  }
  await insertLocalProjection(db, input);
}

async function insertLocalProjection(db: DbPort, input: ApplyUnifiedLibraryMigrationInput) {
  const decision = input.library;
  if (!decision.group_id || !decision.local_member_id) return;
  const local = decision.members.find((member) => member.member_id === decision.local_member_id);
  if (!local?.installation_id) return;
  const state = decision.binding_state === 'active' ? 'active'
    : decision.binding_state === 'departed' ? 'left' : 'repair';
  await db.run(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_member_id, installation_id, member_state, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)`, [
    decision.group_id, local.member_id, local.installation_id, state, input.now
  ]);
  if (state === 'active') return;
  await db.run(`INSERT INTO sync_group_departure_outbox
    (departure_id, group_id, timeline_id, member_id, kind, roster_revision, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'leave', ?, ?, ?, ?)`, [
    `legacy-departure:${decision.library_id}:${decision.group_id}`, decision.group_id,
    decision.timeline_id, local.member_id, decision.roster_revision,
    state === 'repair' ? 'repair' : 'pending', input.now, input.now
  ]);
}

function legacyGroup(group: LegacyGroupRow, members: LegacyMemberRow[]): LegacyUnifiedGroupSnapshot {
  return {
    created_at: group.created_at,
    created_by_member_key: group.created_by_host_name,
    display_name: group.display_name,
    group_id: group.group_id,
    members: members.filter((member) => member.group_id === group.group_id).map((member) => ({
      authorization_id: member.authorization_id,
      display_name: member.host_name,
      host_platform: member.host_platform,
      joined_at: member.joined_at,
      legacy_member_key: member.host_name,
      state: member.state
    })),
    timeline_id: group.timeline_id
  };
}

async function tableExists(db: DbPort, table: string) {
  return (await db.query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [table])).length > 0;
}

async function readUserVersion(db: DbPort) {
  const rows = await db.query('PRAGMA user_version');
  const version = Number(Object.values(rows[0] ?? {})[0]);
  validateVersion(version);
  return version;
}

function validateVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('invalid unified migration schema version');
}
