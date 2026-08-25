// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { runIosMigrationAcceptanceLeg } from './iosSyncGroupMigrationAcceptanceHarness';
import type { IosMigrationSecureStore } from './iosSyncGroupMigrationSecureStore';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  close: vi.fn(),
  digest: vi.fn(),
  open: vi.fn(),
  readRegistry: vi.fn(),
  readSnapshot: vi.fn(),
  seed: vi.fn()
}));

vi.mock('../../lib/core/database/syncGroupUnifiedDigest', () => ({
  digestUnifiedMigrationValue: mocks.digest
}));
vi.mock('../../lib/core/database/syncGroupUnifiedMigrationCoordinator', () => ({
  applyUnifiedMigration: mocks.apply,
  rollbackUnifiedMigration: vi.fn()
}));
vi.mock('../../lib/core/database/syncGroupUnifiedMigrationFixture', () => ({
  createUnifiedMigrationLegacyFixture: () => ({
    current_library_id: 'library-a',
    installation_id: 'installation-a',
    libraries: [{ library_id: 'library-a' }, { library_id: 'library-b' }]
  }),
  readUnifiedProtectedFixtureSnapshot: mocks.readSnapshot,
  seedUnifiedMigrationLegacyLibrary: mocks.seed
}));
vi.mock('../../lib/core/database/syncGroupUnifiedRegistryStore', () => ({
  DbPortUnifiedInstallationRegistry: class {
    read() { return mocks.readRegistry(); }
    write(value: unknown) { return Promise.resolve(value); }
  }
}));
vi.mock('../shared/platform/companion/runtime/iosSyncGroupMigrationAcceptanceDatabaseAdapter', () => ({
  openIosSyncGroupMigrationAcceptanceDatabases: mocks.open
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps task-owned databases open until fault recovery finishes', async () => {
  let closed = false;
  const databases = ['library-a', 'library-b', 'registry'].map((name) => ({
    db: {
      query: vi.fn(async () => {
        if (closed) throw new Error('database queried after owner closed');
        return [{ user_version: 32 }];
      }),
      run: vi.fn(),
      transaction: vi.fn()
    },
    name
  }));
  mocks.close.mockImplementation(async () => { closed = true; });
  mocks.open.mockResolvedValue({
    close: mocks.close,
    databases
  });
  mocks.seed.mockImplementation(async () => {
    if (closed) throw new Error('database seeded after owner closed');
  });
  mocks.readSnapshot.mockImplementation(async () => {
    if (closed) throw new Error('snapshot read after owner closed');
    return { nodes: [] };
  });
  mocks.digest.mockResolvedValue('protected-digest');
  mocks.apply.mockImplementation(async () => {
    await Promise.resolve();
    throw new Error('injected registry write fault');
  });
  mocks.readRegistry.mockImplementation(async () => {
    if (closed) throw new Error('registry read after owner closed');
    return { active_binding: null, installation_id: null, journal: null, revision: 0 };
  });
  const secureStore = {
    evidence: vi.fn(async () => ({ credential_signature: 'sealed', is_paired: true })),
    faultOnVerify: false
  } as unknown as IosMigrationSecureStore;

  await expect(runIosMigrationAcceptanceLeg(secureStore, 'registry')).resolves.toMatchObject({
    fault_observed: true,
    registry_restored: true,
    versions_after_recovery: [32, 32]
  });
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(closed).toBe(true);
});
