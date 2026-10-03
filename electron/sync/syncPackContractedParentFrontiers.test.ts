import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { validateStoredVersionDependencies } from '../../lib/core/sync/syncPackNodeVersionDependencyValidation.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

function createFixture() {
  const database = new Database(':memory:');
  database.exec(`CREATE TABLE node_sync_versions (
    version_id TEXT PRIMARY KEY, object_id TEXT, parent_version_id TEXT,
    body_text TEXT, snapshot_json TEXT);
    CREATE TABLE node_sync_version_parents (
      version_id TEXT, parent_version_id TEXT, ordinal INTEGER);
    INSERT INTO node_sync_versions VALUES
      ('base-left', 'topic', NULL, 'Left', '{}'),
      ('base-right', 'topic', NULL, 'Right', '{}'),
      ('final-left', 'topic', 'base-left', 'Shared', '{}'),
      ('resolution', 'topic', 'base-right', 'Shared', '{}');
    INSERT INTO node_sync_version_parents VALUES
      ('final-left', 'base-left', 0),
      ('resolution', 'base-right', 0),
      ('resolution', 'final-left', 1);`);
  return database;
}

it.each([false, true])('accepts independently contracted frontiers without replacing lineage (childOmitted=%s)', async omitted => {
  const database = createFixture();
  try {
    const before = database.prepare('SELECT * FROM node_sync_version_parents').all();
    await validateStoredVersionDependencies(createBetterSqliteDbPort(database), [
      { version_id: 'final-right', object_id: 'topic', parent_version_id: 'base-right' },
      ...omitted ? [] : [{ version_id: 'resolution', object_id: 'topic', parent_version_id: 'base-left' }]
    ], [
      { version_id: 'final-right', parent_version_id: 'base-right', ordinal: 0 },
      { version_id: 'resolution', parent_version_id: 'base-left', ordinal: 0 },
      { version_id: 'resolution', parent_version_id: 'final-right', ordinal: 1 }
    ]);
    expect(database.prepare('SELECT * FROM node_sync_version_parents').all()).toEqual(before);
  } finally { database.close(); }
});

it('rejects a replacement frontier that does not prove every retained branch', async () => {
  const database = createFixture();
  try {
    await expect(validateStoredVersionDependencies(createBetterSqliteDbPort(database), [
      { version_id: 'resolution', object_id: 'topic', parent_version_id: 'base-left' }
    ], [{ version_id: 'resolution', parent_version_id: 'base-left', ordinal: 0 }]))
      .rejects.toThrow('sync_pack_node_version_parent_mismatch:resolution');
  } finally { database.close(); }
});
