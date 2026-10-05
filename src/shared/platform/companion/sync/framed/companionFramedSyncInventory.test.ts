import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';

import { readCompanionFramedSyncInventory } from './companionFramedSyncInventory.js';

it('serializes the active companion inventory without a database snapshot', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT NOT NULL);
    CREATE TABLE node_sync_versions (
      version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, body_text TEXT, content_hash TEXT NOT NULL
    );
    CREATE TABLE node_sync_version_parents (
      version_id TEXT NOT NULL, parent_version_id TEXT NOT NULL, ordinal INTEGER NOT NULL
    );
    CREATE TABLE review_log (node_id TEXT NOT NULL, op_id TEXT NOT NULL);
    INSERT INTO nodes VALUES ('node-a', 'version-a');
    INSERT INTO node_sync_versions VALUES ('version-a', 'node-a', 'body', '${'11'.repeat(32)}');
  `);

  await expect(readCompanionFramedSyncInventory(createBetterSqliteDbPort(sqlite)))
    .resolves.toEqual({ entries: [{
      frontier_fact_ids: ['version-a'],
      global_id: 'node-a',
      object_type: 'node',
      required_relation_ids: [],
      resource_hashes: ['230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5'],
      review_fact_ids: [],
      shared_state_hash: '11'.repeat(32)
    }] });
  sqlite.close();
});
