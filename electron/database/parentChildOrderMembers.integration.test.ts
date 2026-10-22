// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { ensureNodeParentMembership } from '../../lib/core/database/nodeOrderMutations.js';
import { PARENT_CHILD_ORDER_MEMBER_SCHEMA } from '../../lib/core/database/parentChildOrderMembers.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

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
  return sqlite.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all();
}

it('an upgraded library indexes every stored order like a new one and keeps the index current', () => {
  const created = new Database(':memory:');
  const upgraded = new Database(':memory:');
  try {
    initializeDatabaseSchema(created);
    initializeDatabaseSchema(upgraded);
    for (const sql of [...PARENT_CHILD_ORDER_MEMBER_SCHEMA].reverse()) {
      const [, type, name] = /^CREATE (TABLE|INDEX|TRIGGER) IF NOT EXISTS (\w+)/u.exec(sql)!;
      upgraded.exec(`DROP ${type} ${name}`);
    }
    storeOrder(upgraded, 'folder-a', '["note-1","note-2","note-1"]');
    storeOrder(upgraded, 'folder-b', '["note-1"]');
    storeOrder(upgraded, 'folder-c', '{not json');
    storeOrder(upgraded, 'folder-d', '[7,"note-3"]');
    upgraded.pragma('user_version = 168');
    initializeDatabaseSchema(upgraded);
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

it('saving a note still takes it out of every other stored order that lists it', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    const driver = createBetterSqlite3Driver(sqlite);
    sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('host_name', ?, ?)")
      .run(JSON.stringify('Mac'), T);
    bindParentOrderWriter(driver, { deviceAnchor: 'device', libraryPath: '/library' });
    const insertNode = sqlite.prepare(`INSERT INTO nodes (id, parent_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?)`);
    for (const id of ['folder-a', 'folder-b', 'folder-c']) insertNode.run(id, null, id, T, T);
    insertNode.run('note', 'folder-a', 'Note', T, T);
    insertNode.run('other', 'folder-c', 'Other', T, T);
    storeOrder(sqlite, 'folder-b', '["note"]');
    storeOrder(sqlite, 'folder-c', '["other"]');
    ensureNodeParentMembership(driver, 'note');
    expect(sqlite.prepare('SELECT parent_id, child_ids_json FROM parent_order_sources ORDER BY parent_id').raw().all())
      .toEqual([['folder-a', '["note"]'], ['folder-b', '[]']]);
    expect(members(sqlite).filter(([, child]) => child === 'note')).toEqual([['folder-a', 'note']]);
  } finally {
    sqlite.close();
  }
});
