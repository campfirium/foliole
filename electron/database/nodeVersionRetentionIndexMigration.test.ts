// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { NODE_VERSION_RETENTION_INDEX_SCHEMA } from '../../lib/core/database/nodeVersionRetentionIndexSchema.js';
import { chainReferencesQuery } from '../../lib/core/sync/nodeVersionChainSql.js';
import { prepareReadySyncIdentityIndex } from '../../lib/core/sync/syncIdentityIndexPreparation.js';
import { buildSyncIdentityNodeFactIndex, readSyncIdentityNodeFactProofRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each(['desktop', 'companion'])('preserves original facts and retention proofs through %s index upgrade and retry', async (host) => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    for (const statement of NODE_VERSION_RETENTION_INDEX_SCHEMA) {
      db.exec(`DROP INDEX ${statement.match(/idx_[a-z_]+/u)![0]}`);
    }
    db.exec(`INSERT INTO nodes (id, title, content, current_version_id,
      anchor_source_version_id, created_at, updated_at) VALUES
      ('article', 'Article', 'head body', 'head', NULL, 't', 't'),
      ('anchor', 'Anchor', '', NULL, 'base', 't', 't');
      INSERT INTO node_sync_versions (version_id, object_id, parent_version_id,
        host_name, created_at, content_hash, body_text, snapshot_json) VALUES
      ('base', 'article', NULL, 'Mac', 't1', 'h1', 'base body', '{"content":"base body"}'),
      ('head', 'article', 'base', 'Mac', 't2', 'h2', 'head body', '{"content":"head body"}'),
      ('branch', 'article', 'base', 'Phone', 't3', 'h3', 'branch body', '{"content":"branch body"}');
      INSERT INTO node_sync_version_parents VALUES ('head', 'base', 0), ('branch', 'base', 0);
      INSERT INTO sync_object_state (object_type, object_id, state_seq,
        current_version_id, content_hash, last_modified_by_host_name, updated_at)
      VALUES ('node', 'article', 1, 'head', 'h2', 'Mac', 't2')`);
    const port = createBetterSqliteDbPort(db);
    await prepareReadySyncIdentityIndex(port);
    await buildSyncIdentityNodeFactIndex(port);
    const proof = await readSyncIdentityNodeFactProofRoot(port);
    const facts = db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
    const edges = db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
    const query = chainReferencesQuery('article');
    const retained = db.prepare(query.sql).all(...query.params);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (host === 'desktop') {
        db.pragma('user_version = 134');
        initializeDatabaseSchema(db);
      } else {
        await port.transaction(tx => migrateCompanionDatabase(tx, 68, 69));
      }
      await buildSyncIdentityNodeFactIndex(port);
      expect(await readSyncIdentityNodeFactProofRoot(port)).toBe(proof);
      expect(db.prepare(query.sql).all(...query.params)).toEqual(retained);
      expect(db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(facts);
      expect(db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(edges);
    }
  } finally { db.close(); }
});
