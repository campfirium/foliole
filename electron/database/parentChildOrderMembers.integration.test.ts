// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { PARENT_CHILD_ORDER_SCHEMA_SQL } from '../../lib/core/database/numberedMigrationParentChildOrder.js';
import { migrateParentChildOrderMembers, PARENT_CHILD_ORDER_MEMBER_SCHEMA } from '../../lib/core/database/parentChildOrderMembers.js';


const T = '2026-10-16T00:00:00.000Z';

function members(sqlite: Database.Database) {
  return sqlite.prepare('SELECT parent_id, child_id FROM parent_child_order_members ORDER BY parent_id, child_id')
    .raw().all() as [string, string][];
}

function storeOrder(sqlite: Database.Database, parentId: string, childIdsJson: string) {
  sqlite.prepare(`INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(parent_id) DO UPDATE SET child_ids_json = excluded.child_ids_json`).run(parentId, childIdsJson, T);
}

function schemaObjects(sqlite: Database.Database) {
  const names = PARENT_CHILD_ORDER_MEMBER_SCHEMA.map(sql =>
    /^CREATE (TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/u.exec(sql)![2]);
  return sqlite.prepare(`SELECT type, name, sql FROM sqlite_master
    WHERE name IN (SELECT value FROM json_each(?)) ORDER BY name`).all(JSON.stringify(names));
}

it('historical reverse-index migration indexed existing lists and subsequent writes', () => {
  const created = new Database(':memory:');
  const upgraded = new Database(':memory:');
  try {
    initializeDatabaseSchema(created);
    initializeDatabaseSchema(upgraded);
    upgraded.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
    created.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
    for (const sql of PARENT_CHILD_ORDER_MEMBER_SCHEMA) created.exec(sql);
    storeOrder(upgraded, 'folder-a', '["note-1","note-2","note-1"]');
    storeOrder(upgraded, 'folder-b', '["note-1"]');
    storeOrder(upgraded, 'folder-c', '{not json');
    storeOrder(upgraded, 'folder-d', '[7,"note-3"]');
    migrateParentChildOrderMembers(upgraded);
    expect(schemaObjects(upgraded)).toEqual(schemaObjects(created));
    expect(members(upgraded)).toEqual([
      ['folder-a', 'note-1'], ['folder-a', 'note-2'], ['folder-b', 'note-1'], ['folder-d', 'note-3']]);
    storeOrder(upgraded, 'folder-a', '["note-2"]');
    upgraded.exec("DELETE FROM parent_child_order WHERE parent_id = 'folder-b'");
    upgraded.exec("UPDATE parent_child_order SET parent_id = 'folder-e' WHERE parent_id = 'folder-d'");
    expect(members(upgraded)).toEqual([['folder-a', 'note-2'], ['folder-e', 'note-3']]);
  } finally {
    created.close();
    upgraded.close();
  }
});
