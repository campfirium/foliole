import Database from 'better-sqlite3';

import type {
  UnifiedLegacySecureStorePort,
  UnifiedMigrationCoordinatorInput
} from '../../lib/core/database/syncGroupUnifiedMigrationCoordinator.js';
import {
  createUnifiedMigrationLegacyFixture,
  seedUnifiedMigrationLegacyLibrary
} from '../../lib/core/database/syncGroupUnifiedMigrationFixture.js';
import {
  DbPortUnifiedInstallationRegistry,
  type UnifiedInstallationRegistryPort
} from '../../lib/core/database/syncGroupUnifiedRegistryStore.js';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import type { LegacySecureCredentialEvidence, UnifiedSecureStoreSnapshot } from '../../lib/platform/syncGroupUnifiedContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export async function createUnifiedDesktopMigrationHarness() {
  const fixture = createUnifiedMigrationLegacyFixture(77);
  const databases = fixture.libraries.map(() => new Database(':memory:'));
  const ports = databases.map((database) => createBetterSqliteDbPort(database));
  for (const [index, library] of fixture.libraries.entries()) {
    const port = required(ports[index], `database port for ${library.library_id}`);
    await seedUnifiedMigrationLegacyLibrary(port, library);
  }
  const registryDatabase = new Database(':memory:');
  const registry = new DbPortUnifiedInstallationRegistry(createBetterSqliteDbPort(registryDatabase));
  const secureStore = new FixtureSecureStore(fixture.credentials);
  const input: UnifiedMigrationCoordinatorInput = {
    create_installation_id: () => fixture.installation_id,
    current_library_id: fixture.current_library_id,
    journal_id: 'journal-t151-1',
    libraries: fixture.libraries.map((library, index) => ({
      db: required(ports[index], `database port for ${library.library_id}`),
      legacy_version: 77,
      library_id: library.library_id,
      target_version: 78
    })),
    now: '2026-08-25T00:00:00.000Z',
    registry,
    secure_store: secureStore
  };
  return {
    close() {
      for (const database of databases) database.close();
      registryDatabase.close();
    },
    databases,
    fixture,
    input,
    ports,
    registry,
    secureStore
  };
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

export class FixtureSecureStore implements UnifiedLegacySecureStorePort {
  private readonly sealed = new Map<string, { credentials: LegacySecureCredentialEvidence[]; secret: string }>();
  private secret = 'sealed-fixture-credential';
  faultOnVerify = false;

  constructor(private credentials: LegacySecureCredentialEvidence[]) {}

  async inspect() {
    return structuredClone(this.credentials);
  }

  async seal(): Promise<UnifiedSecureStoreSnapshot> {
    const snapshot = {
      credential_count: this.credentials.length,
      digest: 'b3f22d64f93b2cd2697f9715b38f83179af6f43a8de74263dd3909a3ea3e1c81',
      sealed_locator: `fixture-seal-${this.sealed.size + 1}`
    };
    this.sealed.set(snapshot.sealed_locator, {
      credentials: structuredClone(this.credentials),
      secret: this.secret
    });
    return snapshot;
  }

  async verify(snapshot: UnifiedSecureStoreSnapshot) {
    if (this.faultOnVerify) throw new Error('injected secure-store verification fault');
    const stored = this.sealed.get(snapshot.sealed_locator);
    if (!stored || snapshot.credential_count !== stored.credentials.length) {
      throw new Error('sealed secure-store snapshot is incomplete');
    }
  }

  async restore(snapshot: UnifiedSecureStoreSnapshot) {
    const stored = this.sealed.get(snapshot.sealed_locator);
    if (!stored) throw new Error('sealed secure-store recovery snapshot missing');
    this.credentials = structuredClone(stored.credentials);
    this.secret = stored.secret;
  }

  snapshot() {
    return { credentials: structuredClone(this.credentials), secret: this.secret };
  }
}

export class FaultingRegistry implements UnifiedInstallationRegistryPort {
  private writes = 0;

  constructor(private readonly inner: UnifiedInstallationRegistryPort, private readonly failAtWrite: number) {}

  read() { return this.inner.read(); }

  async write(snapshot: Parameters<UnifiedInstallationRegistryPort['write']>[0]) {
    this.writes += 1;
    await this.inner.write(snapshot);
    if (this.writes === this.failAtWrite) throw new Error('injected registry write fault');
  }
}

export function faultingDbPort(inner: DbPort, pattern: string): DbPort {
  let fired = false;
  const wrap = (port: DbPort): DbPort => ({
    async query<T extends DbRow = DbRow>(sql: string, params?: DbParams) {
      return port.query<T>(sql, params);
    },
    async run(sql: string, params?: DbParams) {
      if (!fired && sql.includes(pattern)) {
        fired = true;
        throw new Error('injected database migration fault');
      }
      return port.run(sql, params);
    },
    transaction<T>(execute: (tx: DbPort) => Promise<T>) {
      return port.transaction((tx) => execute(wrap(tx)));
    }
  });
  return wrap(inner);
}
