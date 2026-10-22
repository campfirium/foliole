// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { retireNodeVersionChainWithDriver } from '../../lib/core/database/nodeVersionChainRetention.js';
import { migrateTopicHistoryRetirement } from '../../lib/core/database/topicHistoryRetirementMigration.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { historicalTextbookLibrary } from './historicalTextbookLibrary.testSupport.js';

const PROJECTIONS = ['framed_sync_inventory ORDER BY object_type, object_id', 'framed_sync_version_summary ORDER BY version_id',
  'framed_sync_fact_summary ORDER BY kind, fact_id', 'node_sync_versions ORDER BY version_id', 'nodes ORDER BY id'];

function projections(sqlite: Database.Database) {
  return Object.fromEntries(PROJECTIONS.map((table) => [table, sqlite.prepare(`SELECT * FROM ${table}`).all()]));
}

it('retires topic history to the same versions and sync inventory as per-node retirement', () => {
  const migrated = historicalTextbookLibrary(12, 4, 2);
  const reference = new Database(migrated.serialize());
  migrated.transaction(() => migrateTopicHistoryRetirement(migrated))();
  const driver = createBetterSqlite3Driver(reference);
  reference.transaction(() => {
    for (let t = 0; t < 12; t++) retireNodeVersionChainWithDriver(driver, `topic-${t}`);
  })();
  expect(migrated.prepare('SELECT count(*) AS n FROM node_sync_versions WHERE body_text IS NULL').get()).toEqual({ n: 36 });
  expect(projections(migrated)).toEqual(projections(reference));
  migrated.close();
  reference.close();
});

it('retires a large textbook history without searching the library once per released body', () => {
  const sqlite = historicalTextbookLibrary(240, 3, 20);
  const started = performance.now();
  sqlite.transaction(() => migrateTopicHistoryRetirement(sqlite))();
  const elapsed = performance.now() - started;
  expect(sqlite.prepare('SELECT count(*) AS n FROM node_sync_versions WHERE body_text IS NULL').get()).toEqual({ n: 480 });
  // The per-body library search this replaces took well over ten seconds on this fixture.
  expect(elapsed).toBeLessThan(4000);
  sqlite.close();
}, 60_000);
