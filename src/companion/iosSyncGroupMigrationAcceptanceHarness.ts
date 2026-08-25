import { digestUnifiedMigrationValue } from '../../lib/core/database/syncGroupUnifiedDigest';
import {
  applyUnifiedMigration,
  rollbackUnifiedMigration,
  type UnifiedMigrationCoordinatorInput
} from '../../lib/core/database/syncGroupUnifiedMigrationCoordinator';
import {
  createUnifiedMigrationLegacyFixture,
  readUnifiedProtectedFixtureSnapshot,
  seedUnifiedMigrationLegacyLibrary
} from '../../lib/core/database/syncGroupUnifiedMigrationFixture';
import {
  DbPortUnifiedInstallationRegistry,
  type UnifiedInstallationRegistryPort
} from '../../lib/core/database/syncGroupUnifiedRegistryStore';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { openIosSyncGroupMigrationAcceptanceDatabases } from
  '../shared/platform/companion/runtime/iosSyncGroupMigrationAcceptanceDatabaseAdapter';

import type { IosMigrationSecureStore } from './iosSyncGroupMigrationSecureStore';

export type IosMigrationFault = 'none' | 'registry' | 'database' | 'secure-store';

export async function runIosMigrationAcceptanceLeg(
  secureStore: IosMigrationSecureStore,
  fault: IosMigrationFault
) {
  const databaseOwner = await openIosSyncGroupMigrationAcceptanceDatabases(fault);
  const databases = databaseOwner.databases;
  try {
    const fixture = createUnifiedMigrationLegacyFixture(32);
    for (const [index, library] of fixture.libraries.entries()) {
      const database = databases[index];
      if (!database) throw new Error(`Missing acceptance database for ${library.library_id}`);
      await seedUnifiedMigrationLegacyLibrary(database.db, library);
    }
    const registryDatabase = databases[2];
    if (!registryDatabase) throw new Error('Missing acceptance installation registry database');
    const registry = new DbPortUnifiedInstallationRegistry(registryDatabase.db);
    const input: UnifiedMigrationCoordinatorInput = {
      create_installation_id: () => fixture.installation_id,
      current_library_id: fixture.current_library_id,
      journal_id: `ios-t151-1-${fault}`,
      libraries: fixture.libraries.map((library, index) => {
        const database = databases[index];
        if (!database) throw new Error(`Missing acceptance database for ${library.library_id}`);
        return {
          db: database.db,
          legacy_version: 32,
          library_id: library.library_id,
          target_version: 33
        };
      }),
      now: '2026-08-25T00:00:00.000Z',
      registry,
      secure_store: secureStore
    };
    const before = await protectedState(input);
    const beforeDigest = await digestUnifiedMigrationValue(before);
    injectFault(input, registry, secureStore, fault);
    if (fault !== 'none') return runFaultLeg(input, registry, secureStore, beforeDigest, fault);
    const applied = await applyUnifiedMigration(input);
    const appliedVersions = await versions(input);
    const registryApplied = await registry.read();
    await rollbackUnifiedMigration(input);
    return {
      active_binding: applied.decision.active_binding,
      decision_digest: applied.decision_digest,
      fault,
      protected_digest: beforeDigest,
      protected_unchanged: await digestUnifiedMigrationValue(await protectedState(input)) === beforeDigest,
      registry_phase: registryApplied.journal?.phase,
      versions_after_apply: appliedVersions,
      versions_after_rollback: await versions(input)
    };
  } finally {
    secureStore.faultOnVerify = false;
    await databaseOwner.close();
  }
}

async function runFaultLeg(
  input: UnifiedMigrationCoordinatorInput,
  registry: UnifiedInstallationRegistryPort,
  secureStore: IosMigrationSecureStore,
  beforeDigest: string,
  fault: Exclude<IosMigrationFault, 'none'>
) {
  let message = '';
  try {
    await applyUnifiedMigration(input);
    throw new Error('injected migration fault unexpectedly succeeded');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const restored = await registry.read();
  return {
    fault,
    fault_observed: message.includes('injected'),
    protected_digest: beforeDigest,
    protected_unchanged: await digestUnifiedMigrationValue(await protectedState(input)) === beforeDigest,
    registry_restored: restored.installation_id === null && restored.active_binding === null && restored.journal === null,
    secure_store: await secureStore.evidence(),
    versions_after_recovery: await versions(input)
  };
}

function injectFault(
  input: UnifiedMigrationCoordinatorInput,
  registry: UnifiedInstallationRegistryPort,
  secureStore: IosMigrationSecureStore,
  fault: IosMigrationFault
) {
  if (fault === 'registry') input.registry = new FaultingRegistry(registry, 2);
  if (fault === 'database') {
    const secondLibrary = input.libraries[1];
    if (!secondLibrary) throw new Error('Missing second acceptance library');
    secondLibrary.db = faultingDbPort(secondLibrary.db, 'CREATE TABLE sync_group_migration_journal');
  }
  if (fault === 'secure-store') secureStore.faultOnVerify = true;
}

function protectedState(input: UnifiedMigrationCoordinatorInput) {
  return Promise.all(input.libraries.map((library) => readUnifiedProtectedFixtureSnapshot(library.db)));
}

async function versions(input: UnifiedMigrationCoordinatorInput) {
  return Promise.all(input.libraries.map(async (library) => {
    const rows = await library.db.query('PRAGMA user_version');
    return Number(Object.values(rows[0] ?? {})[0]);
  }));
}

class FaultingRegistry implements UnifiedInstallationRegistryPort {
  private writes = 0;
  constructor(private readonly inner: UnifiedInstallationRegistryPort, private readonly failAt: number) {}
  read() { return this.inner.read(); }
  async write(snapshot: Parameters<UnifiedInstallationRegistryPort['write']>[0]) {
    this.writes += 1;
    await this.inner.write(snapshot);
    if (this.writes === this.failAt) throw new Error('injected registry write fault');
  }
}

function faultingDbPort(inner: DbPort, pattern: string): DbPort {
  let fired = false;
  const wrap = (port: DbPort): DbPort => ({
    query<T extends DbRow = DbRow>(sql: string, params?: DbParams) { return port.query<T>(sql, params); },
    run(sql: string, params?: DbParams) {
      if (!fired && sql.includes(pattern)) {
        fired = true;
        throw new Error('injected database migration fault');
      }
      return port.run(sql, params);
    },
    transaction<T>(execute: (tx: DbPort) => Promise<T>) { return port.transaction((tx) => execute(wrap(tx))); }
  });
  return wrap(inner);
}
