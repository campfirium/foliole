// @vitest-environment node

import { afterEach, expect, it } from 'vitest';

import {
  applyUnifiedMigration,
  rollbackUnifiedMigration
} from '../../lib/core/database/syncGroupUnifiedMigrationCoordinator.js';
import { readUnifiedProtectedFixtureSnapshot } from '../../lib/core/database/syncGroupUnifiedMigrationFixture.js';

import {
  createUnifiedDesktopMigrationHarness,
  FaultingRegistry,
  faultingDbPort
} from './syncGroupUnifiedMigrationTestSupport.js';

let closeHarness: (() => void) | null = null;

afterEach(() => {
  closeHarness?.();
  closeHarness = null;
});

it('applies inactive desktop v78 across registered libraries and explicitly restores v77', async () => {
    const harness = await createHarness();
    const before = await protectedSnapshots(harness.input.libraries);
    const secureBefore = harness.secureStore.snapshot();

    const result = await applyUnifiedMigration(harness.input);

    expect(result.decision.active_binding).toMatchObject({
      group_id: 'group-a', library_id: 'library-a', state: 'active'
    });
    expect(harness.databases.map((database) => database.pragma('user_version', { simple: true })))
      .toEqual([78, 78]);
    expect(harness.databases.map((database) => database.prepare(
      "SELECT count(*) FROM sync_group_local_state WHERE member_state = 'active'"
    ).pluck().get())).toEqual([1, 0]);
    const [firstDatabase, secondDatabase] = harness.databases;
    if (!firstDatabase || !secondDatabase) throw new Error('desktop migration fixture databases missing');
    expect(secondDatabase.prepare('SELECT count(*) FROM sync_group_departure_outbox').pluck().get()).toBe(1);
    expect(firstDatabase.prepare(
      "SELECT member_id FROM sync_group_members WHERE authorization_id IN ('authorization-v','authorization-v2') ORDER BY member_id"
    ).pluck().all()).toEqual([
      'legacy-member:authorization-v',
      'legacy-member:authorization-v2'
    ]);
    expect(await protectedSnapshots(harness.input.libraries)).toEqual(before);
    expect(harness.secureStore.snapshot()).toEqual(secureBefore);
    expect(await harness.registry.read()).toMatchObject({
      active_binding: { group_id: 'group-a', library_id: 'library-a' },
      installation_id: harness.fixture.installation_id,
      journal: { phase: 'committed' }
    });

    await rollbackUnifiedMigration(harness.input);

    expect(harness.databases.map((database) => database.pragma('user_version', { simple: true })))
      .toEqual([77, 77]);
    expect(await protectedSnapshots(harness.input.libraries)).toEqual(before);
    expect(harness.secureStore.snapshot()).toEqual(secureBefore);
    expect(await harness.registry.read()).toEqual({
      active_binding: null, installation_id: null, journal: null, revision: 0
    });
});

it.each(['registry', 'database', 'secure-store'] as const)(
  'recovers every database, registry, and sealed credential after a %s fault',
  async (fault) => {
      const harness = await createHarness();
      const before = await protectedSnapshots(harness.input.libraries);
      const secureBefore = harness.secureStore.snapshot();
      if (fault === 'registry') {
        harness.input.registry = new FaultingRegistry(harness.registry, 2);
      } else if (fault === 'database') {
        const secondLibrary = harness.input.libraries[1];
        if (!secondLibrary) throw new Error('desktop migration second library missing');
        secondLibrary.db = faultingDbPort(
          secondLibrary.db,
          'CREATE TABLE sync_group_migration_journal'
        );
      } else {
        harness.secureStore.faultOnVerify = true;
      }

      await expect(applyUnifiedMigration(harness.input)).rejects.toThrow(/injected/u);

      expect(harness.databases.map((database) => database.pragma('user_version', { simple: true })))
        .toEqual([77, 77]);
      expect(await protectedSnapshots(harness.input.libraries)).toEqual(before);
      expect(harness.secureStore.snapshot()).toEqual(secureBefore);
      expect(await harness.registry.read()).toEqual({
        active_binding: null, installation_id: null, journal: null, revision: 0
      });
      expect(harness.databases.map((database) => database.prepare(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'sync_group_migration_journal'"
      ).pluck().get())).toEqual([0, 0]);
  }
);

async function createHarness() {
  const harness = await createUnifiedDesktopMigrationHarness();
  closeHarness = harness.close;
  return harness;
}

function protectedSnapshots(libraries: Array<{ db: Parameters<typeof readUnifiedProtectedFixtureSnapshot>[0] }>) {
  return Promise.all(libraries.map(({ db }) => readUnifiedProtectedFixtureSnapshot(db)));
}
