// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

it('upgrades the existing arrangement history transactionally and remains idempotent', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`INSERT INTO parent_order_versions VALUES ('history', 'folder', 'baseline', '["a"]', '[]', 'now');
      INSERT INTO parent_order_heads VALUES ('folder', 'history');
      DROP TABLE parent_order_member_positions; PRAGMA user_version = 145`);
    const before = db.prepare('SELECT * FROM parent_order_versions').all();
    initializeDatabaseSchema(db);
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(db.prepare('SELECT * FROM parent_order_versions').all()).toEqual(before);
    expect(db.prepare('SELECT * FROM parent_order_member_positions').all()).toEqual([]);
    initializeDatabaseSchema(db);
    expect(db.prepare('SELECT * FROM parent_order_versions').all()).toEqual(before);
  } finally { db.close(); }
});

it('rolls back the schema upgrade if a required arrangement position index cannot be installed', () => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec(`DROP TABLE parent_order_member_positions;
      CREATE TABLE parent_order_member_positions (unrelated TEXT); PRAGMA user_version = 145`);
    expect(() => initializeDatabaseSchema(db)).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(145);
    expect(db.prepare('PRAGMA table_info(parent_order_member_positions)').all()).toMatchObject([{ name: 'unrelated' }]);
  } finally { db.close(); }
});
