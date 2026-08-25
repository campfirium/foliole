import { expect, it, vi } from 'vitest';

import { COMPANION_DATABASE_VERSION } from '../../platform/nativeCompanionContract.js';
import {
  EMPTY_UNIFIED_INSTALLATION_REGISTRY,
  UNIFIED_COMPANION_SCHEMA_VERSION
} from '../../platform/syncGroupUnifiedContract.js';
import type { DbParams, DbPort, DbRow } from '../sync/dbPort.js';

import {
  applyUnifiedLibraryMigration,
  readLegacyUnifiedLibrarySnapshot
} from './syncGroupUnifiedMigrationExecutor.js';
import { createUnifiedMigrationLegacyFixture } from './syncGroupUnifiedMigrationFixture.js';
import { createUnifiedMigrationDecision } from './syncGroupUnifiedMigrationModel.js';

it('runs the inactive companion v33 migration only through DbPort', async () => {
  const fixture = createUnifiedMigrationLegacyFixture(COMPANION_DATABASE_VERSION);
  const { port, run } = companionFixturePort();
  const library = await readLegacyUnifiedLibrarySnapshot(port, 'library-a');
  const secondLibrary = fixture.libraries[1];
  if (!secondLibrary) throw new Error('companion migration second library fixture missing');
  const decision = createUnifiedMigrationDecision({
    credentials: fixture.credentials,
    current_library_id: fixture.current_library_id,
    installation_id: fixture.installation_id,
    libraries: [library, secondLibrary],
    registry: EMPTY_UNIFIED_INSTALLATION_REGISTRY
  });

  const firstDecision = decision.libraries[0];
  if (!firstDecision) throw new Error('companion migration first library decision missing');
  await applyUnifiedLibraryMigration(port, {
    decision_digest: 'decision-digest',
    journal_id: 'journal-companion',
    legacy_version: COMPANION_DATABASE_VERSION,
    library: firstDecision,
    now: '2026-08-25T00:00:00.000Z',
    target_version: UNIFIED_COMPANION_SCHEMA_VERSION
  });

  const statements = run.mock.calls.map(([sql]) => String(sql));
  expect(statements).toContain('PRAGMA user_version = 33');
  expect(statements.some((sql) => sql.startsWith('CREATE TABLE sync_group_migration_journal'))).toBe(true);
  expect(statements.some((sql) => sql.includes('sealed_legacy_v32_sync_groups'))).toBe(true);
  expect(COMPANION_DATABASE_VERSION).toBe(32);
});

function companionFixturePort() {
  const fixture = createUnifiedMigrationLegacyFixture(COMPANION_DATABASE_VERSION).libraries[0];
  if (!fixture) throw new Error('companion migration fixture missing');
  const group = fixture.groups[0];
  if (!group) throw new Error('companion migration group fixture missing');
  const legacyTables = new Set([
    'sync_groups', 'sync_group_members', 'sync_group_member_departures',
    'sync_group_local_state', 'sync_group_nonce_ledger'
  ]);
  const run = vi.fn(async (sql: string, params?: DbParams) => {
    void sql;
    void params;
    return { changes: 1, lastInsertRowId: null };
  });
  const port: DbPort = {
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []): Promise<T[]> {
      let rows: DbRow[];
      if (sql === 'PRAGMA user_version') rows = [{ user_version: COMPANION_DATABASE_VERSION }];
      else if (sql.includes('FROM sync_groups ORDER BY')) rows = [{
        created_at: group.created_at,
        created_by_host_name: group.created_by_member_key,
        display_name: group.display_name,
        group_id: group.group_id,
        timeline_id: group.timeline_id
      }];
      else if (sql.includes('FROM sync_group_members ORDER BY')) rows = group.members.map((member) => ({
        authorization_id: member.authorization_id,
        group_id: group.group_id,
        host_name: member.legacy_member_key,
        host_platform: member.host_platform,
        joined_at: member.joined_at,
        state: member.state
      }));
      else if (sql.includes('FROM sync_group_local_state WHERE')) rows = [{ group_id: group.group_id }];
      else if (sql.includes('sqlite_master')) rows = legacyTables.has(String(params[0])) ? [{ present: 1 }] : [];
      else rows = [];
      return rows as T[];
    },
    run,
    transaction<T>(execute: (tx: DbPort) => Promise<T>) { return execute(port); }
  };
  return { port, run };
}
