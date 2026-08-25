import type {
  LegacySecureCredentialEvidence,
  LegacyUnifiedLibrarySnapshot
} from '../../platform/syncGroupUnifiedContract.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

export const UNIFIED_MIGRATION_FIXTURE_INSTALLATION_ID = 'installation-00000000-0000-4000-8000-000000000151';
export const UNIFIED_MIGRATION_FIXTURE_CURRENT_LIBRARY_ID = 'library-a';

export function createUnifiedMigrationLegacyFixture(userVersion: number) {
  return {
    credentials: fixtureCredentials(),
    current_library_id: UNIFIED_MIGRATION_FIXTURE_CURRENT_LIBRARY_ID,
    installation_id: UNIFIED_MIGRATION_FIXTURE_INSTALLATION_ID,
    libraries: fixtureLibraries(userVersion)
  };
}

export async function seedUnifiedMigrationLegacyLibrary(
  db: DbPort,
  library: LegacyUnifiedLibrarySnapshot
) {
  const group = library.groups[0];
  if (!group) throw new Error('unified migration fixture group missing');
  await db.transaction(async (tx) => {
    for (const statement of LEGACY_FIXTURE_SCHEMA) await tx.run(statement);
    await tx.run('INSERT INTO nodes VALUES (?, ?, ?)', [`node-${library.library_id}`, 'Fixture body', 'body-hash']);
    await tx.run('INSERT INTO node_versions VALUES (?, ?, ?)', [`version-${library.library_id}`,
      `node-${library.library_id}`, 'version-hash']);
    await tx.run('INSERT INTO attachments VALUES (?, ?)', [`attachment-${library.library_id}`, 'attachment-hash']);
    await tx.run('INSERT INTO review_log VALUES (?, ?)', [`review-${library.library_id}`, 'review-hash']);
    await tx.run('INSERT INTO setting_records VALUES (?, ?)', ['theme', 'settings-hash']);
    await tx.run('INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?, ?, ?)', [group.group_id, group.display_name,
      group.timeline_id, group.created_by_member_key, group.created_at, group.created_at, 'legacy-workgroup-key']);
    for (const member of group.members) {
      await tx.run(`INSERT INTO sync_group_members
        (group_id, host_name, host_platform, state, approved_by_host_name, authorization_id,
         provisioning_cursor, joined_at, activated_at, left_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`, [
        group.group_id, member.legacy_member_key, member.host_platform, member.state,
        group.created_by_member_key, member.authorization_id, member.joined_at,
        member.state === 'active' ? member.joined_at : null, member.joined_at
      ]);
    }
    const local = group.members[0];
    if (!local) throw new Error(`Legacy fixture group ${group.group_id} has no local member`);
    await tx.run(`INSERT INTO sync_group_local_state
      (singleton_id, group_id, local_host_name, member_state, provisioning_cursor,
       created_empty_proof_json, updated_at) VALUES (1, ?, ?, 'active', NULL, NULL, ?)`,
    [group.group_id, local.legacy_member_key, local.joined_at]);
    await tx.run(`INSERT INTO sync_group_nonce_ledger VALUES (?, ?, ?)`, [group.group_id, 'legacy-nonce', 1]);
    await tx.run(`PRAGMA user_version = ${library.user_version}`);
  });
}

export async function readUnifiedProtectedFixtureSnapshot(db: DbPort) {
  const result: Record<string, DbRow[]> = {};
  for (const table of PROTECTED_TABLES) {
    result[table] = await db.query(`SELECT * FROM ${table} ORDER BY 1`);
  }
  return result;
}

function fixtureLibraries(userVersion: number): LegacyUnifiedLibrarySnapshot[] {
  return [
    library('library-a', userVersion, 'group-a', 'timeline-a', [
      member('Maci', 'Maci', 'darwin', 'authorization-local-a'),
      member('V', 'V', 'windows', 'authorization-v'),
      member('V 2', 'V', 'windows', 'authorization-v2')
    ]),
    library('library-b', userVersion, 'group-b', 'timeline-b', [
      member('Maci', 'Maci', 'darwin', 'authorization-local-b'),
      member('Reader', 'Reader', 'android', 'authorization-reader')
    ])
  ];
}

function fixtureCredentials(): LegacySecureCredentialEvidence[] {
  return [
    credential('group-a', 'authorization-local-a', 'Maci', 'local-authorization', 'local-a'),
    credential('group-b', 'authorization-local-b', 'Maci', 'local-authorization', 'local-b'),
    credential('group-a', 'authorization-v', 'V', 'peer-route', 'route-v'),
    credential('group-a', 'authorization-v2', 'V 2', 'peer-route', 'route-v2-a'),
    credential('group-a', 'authorization-v2', 'V 2', 'peer-route', 'route-v2-b')
  ];
}

function library(
  libraryId: string,
  userVersion: number,
  groupId: string,
  timelineId: string,
  members: LegacyUnifiedLibrarySnapshot['groups'][number]['members']
): LegacyUnifiedLibrarySnapshot {
  return {
    groups: [{ created_at: '2026-08-25T00:00:00.000Z', created_by_member_key: 'Maci',
      display_name: 'Maci Sync Group', group_id: groupId, members, timeline_id: timelineId }],
    library_id: libraryId,
    singleton_group_id: groupId,
    user_version: userVersion
  };
}

function member(legacyKey: string, displayName: string, platform: string, authorizationId: string) {
  return { authorization_id: authorizationId, display_name: displayName, host_platform: platform,
    joined_at: '2026-08-25T00:00:00.000Z', legacy_member_key: legacyKey, state: 'active' as const };
}

function credential(
  groupId: string,
  authorizationId: string,
  memberKey: string,
  kind: LegacySecureCredentialEvidence['kind'],
  fingerprint: string
): LegacySecureCredentialEvidence {
  return { authorization_id: authorizationId, credential_fingerprint: fingerprint,
    group_id: groupId, kind, legacy_member_key: memberKey };
}

const PROTECTED_TABLES = ['nodes', 'node_versions', 'attachments', 'review_log', 'setting_records'] as const;

const LEGACY_FIXTURE_SCHEMA = [
  'CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL, content_hash TEXT NOT NULL)',
  'CREATE TABLE node_versions (id TEXT PRIMARY KEY, node_id TEXT NOT NULL, body_hash TEXT NOT NULL)',
  'CREATE TABLE attachments (id TEXT PRIMARY KEY, content_hash TEXT NOT NULL)',
  'CREATE TABLE review_log (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL)',
  'CREATE TABLE setting_records (key TEXT PRIMARY KEY, content_hash TEXT NOT NULL)',
  `CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
    timeline_id TEXT NOT NULL, created_by_host_name TEXT NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, workgroup_key TEXT)`,
  `CREATE TABLE sync_group_members (group_id TEXT NOT NULL, host_name TEXT NOT NULL,
    host_platform TEXT NOT NULL, state TEXT NOT NULL, approved_by_host_name TEXT NOT NULL,
    authorization_id TEXT NOT NULL UNIQUE, provisioning_cursor INTEGER, joined_at TEXT NOT NULL,
    activated_at TEXT, left_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (group_id, host_name))`,
  `CREATE TABLE sync_group_member_departures (group_id TEXT NOT NULL, host_name TEXT NOT NULL,
    authorized_by_host_name TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE,
    left_at TEXT NOT NULL, PRIMARY KEY (group_id, host_name))`,
  `CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
    local_host_name TEXT NOT NULL, member_state TEXT NOT NULL, provisioning_cursor INTEGER,
    created_empty_proof_json TEXT, updated_at TEXT NOT NULL)`,
  `CREATE TABLE sync_group_nonce_ledger (group_id TEXT NOT NULL, identity TEXT NOT NULL,
    expires_at INTEGER NOT NULL, PRIMARY KEY (group_id, identity))`
] as const;
