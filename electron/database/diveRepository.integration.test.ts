// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

it('retires only legacy Dive workspace metadata on upgrade', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.pragma('user_version = 185');
    const put = db.prepare("INSERT OR REPLACE INTO workspace_meta (key, value, updated_at) VALUES (?, ?, 'now')");
    put.run('dive:old', 'legacy data');
    put.run('active_node_id', 'active');
    put.run('dive;other', 'unrelated');

    initializeDatabaseSchema(db);

    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(db.prepare("SELECT key FROM workspace_meta WHERE key >= 'dive:' AND key < 'dive;'").all()).toEqual([]);
    expect(db.prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'").pluck().get()).toBe('active');
    expect(db.prepare("SELECT value FROM workspace_meta WHERE key = 'dive;other'").pluck().get()).toBe('unrelated');
  } finally {
    db.close();
  }
});
