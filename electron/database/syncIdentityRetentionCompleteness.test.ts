// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { syncIdentityRetentionIsComplete } from '../../lib/core/sync/syncIdentityRetentionCompleteness.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('refuses a missing required common body or original ancestor even when both tips have bodies', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      parent_version_id TEXT, body_text TEXT, snapshot_json TEXT);
      CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT, ordinal INTEGER);
      INSERT INTO node_sync_versions VALUES ('base', 'node', NULL, NULL, '{"content":null}'),
        ('left', 'node', 'base', 'left body', '{}'), ('right', 'node', 'base', 'right body', '{}');
      INSERT INTO node_sync_version_parents VALUES ('left', 'base', 0), ('right', 'base', 0);`);
    const port = createBetterSqliteDbPort(db);
    const required = { headId: 'left', protectedIds: ['left', 'right'], frozenIds: [] };
    expect(await syncIdentityRetentionIsComplete(port, 'main', 'node', required)).toBe(false);
    db.prepare("UPDATE node_sync_versions SET body_text = 'original base' WHERE version_id = 'base'").run();
    expect(await syncIdentityRetentionIsComplete(port, 'main', 'node', required)).toBe(true);
    db.prepare("DELETE FROM node_sync_versions WHERE version_id = 'base'").run();
    expect(await syncIdentityRetentionIsComplete(port, 'main', 'node', required)).toBe(false);
  } finally { db.close(); }
});
