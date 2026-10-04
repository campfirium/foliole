import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS } from '../../lib/core/database/syncIdentityIndexSchemaStatements.js';

it('records changed object identities in the same transaction as state writes', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL UNIQUE,
      current_version_id TEXT, content_hash TEXT NOT NULL, updated_at TEXT NOT NULL,
      deleted_at TEXT, PRIMARY KEY (object_type, object_id)
    )`);
    for (const statement of SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS) db.exec(statement);
    const dirty = () => db.prepare(`SELECT object_type, object_id FROM sync_identity_dirty_keys
      ORDER BY object_type, object_id`).all();
    db.exec(`INSERT INTO sync_object_state VALUES ('node', 'one', 1, 'v1', 'h1', 't1', NULL)`);
    expect(dirty()).toEqual([{ object_type: 'node', object_id: 'one' }]);
    db.exec(`INSERT OR REPLACE INTO sync_object_state VALUES ('node', 'one', 2, 'v2', 'h2', 't2', NULL)`);
    expect(dirty()).toEqual([{ object_type: 'node', object_id: 'one' }]);
    db.exec('DELETE FROM sync_identity_dirty_keys');
    expect(() => db.transaction(() => {
      db.exec(`UPDATE sync_object_state SET content_hash = 'h2' WHERE object_id = 'one'`);
      throw new Error('rollback');
    })()).toThrow('rollback');
    expect(dirty()).toEqual([]);
    db.exec(`UPDATE sync_object_state SET object_id = 'two' WHERE object_id = 'one'`);
    expect(dirty()).toEqual([
      { object_type: 'node', object_id: 'one' },
      { object_type: 'node', object_id: 'two' }
    ]);
    db.exec('DELETE FROM sync_identity_dirty_keys');
    db.exec(`DELETE FROM sync_object_state WHERE object_id = 'two'`);
    expect(dirty()).toEqual([{ object_type: 'node', object_id: 'two' }]);
  } finally {
    db.close();
  }
});
