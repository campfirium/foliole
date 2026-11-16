// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { CURRENT_PARENT_ORDER_SCHEMA } from '../../lib/core/database/currentParentOrderSchema.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { PARENT_CHILD_ORDER_SCHEMA_SQL } from '../../lib/core/database/numberedMigrationParentChildOrder.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { textBranch } from './topicTextState.testSupport.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  sqlite.exec("INSERT INTO settings VALUES ('host_name', 'Test', 'now')");
  bindParentOrderWriter(driver, { deviceAnchor: 'test', libraryPath: '/test' });
  const port = createBetterSqliteDbPort(sqlite);
  const save = (content: string) => upsertNodeSnapshot(driver, { nodeId: 'topic', kind: 'topic',
    parentNodeId: null, title: 'Topic', content, createdAt: '2026-01-01', updatedAt: '2026-10-29',
    isTitleManual: true, anchorLink: null, reveal: null, position: null });
  return { sqlite, driver, port, save };
}

it('does not project directory members for a body save or same-value structure writeback', () => {
  const host = fixture();
  host.save('First body');
  const before = host.sqlite.prepare('SELECT * FROM parent_order_sources').all();
  for (const content of ['New body', 'New body']) host.save(content);
  expect(host.sqlite.prepare('SELECT * FROM parent_order_sources').all()).toEqual(before);
  expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('New body');
});

it('does not project directory members after a remote body version applies its full snapshot', async () => {
  const host = fixture();
  const first = textBranch('v1', 'Original');
  expect((await applyConvergentSyncNodesWithDbPort(host.port, [first])).workspaceStructureChanged).toBe(true);
  const changed = await applyConvergentSyncNodesWithDbPort(host.port, [textBranch('v2', 'Replacement', first)]);
  expect(changed.workspaceStructureChanged).toBe(false);
  expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('Replacement');
});

it('marks committed remote renames, moves, and visibility transitions as structural', async () => {
  const host = fixture();
  host.sqlite.exec("INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('folder','folder','Folder','2026-01-01','2026-01-01')");
  let current = textBranch('v1', 'Body');
  await applyConvergentSyncNodesWithDbPort(host.port, [current]);
  const edits = [
    { title: 'Renamed' },
    { parent_id: 'folder' },
    { deleted_at: '2026-11-16' },
    { deleted_at: null },
    { parent_id: null }
  ];
  for (const [index, edit] of edits.entries()) {
    const incoming = textBranch(`v${index + 2}`, 'Body', current);
    incoming.snapshot = { ...current.snapshot, updated_at: incoming.updated_at, ...edit };
    const result = await applyConvergentSyncNodesWithDbPort(host.port, [incoming]);
    expect(result.workspaceStructureChanged).toBe(true);
    expect(host.sqlite.prepare("SELECT title,parent_id,deleted_at FROM nodes WHERE id='topic'").get()).toMatchObject(edit);
    current = incoming;
  }
});

it('retires historical triggers on the final desktop upgrade', () => {
  const host = fixture(); host.save('Body');
  host.sqlite.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) host.sqlite.exec(sql);
  host.sqlite.exec('DROP TRIGGER trg_parent_order_node_update');
  host.sqlite.exec(CURRENT_PARENT_ORDER_SCHEMA[4]!.replace(/\s+WHEN[\s\S]*? BEGIN/, ' BEGIN'));
  host.sqlite.pragma('user_version=181');
  expect(() => initializeDatabaseSchema(host.sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } })).toThrow('interrupted');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(181);
  initializeDatabaseSchema(host.sqlite);
  expect(host.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'parent_order_projection_pending'").get()).toBeUndefined();
  host.save('Upgraded body');
});

it('upgrades the installed companion trigger without rewriting directory state', async () => {
  const host = fixture(); host.save('Body');
  host.sqlite.exec(PARENT_CHILD_ORDER_SCHEMA_SQL);
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) host.sqlite.exec(sql);
  host.sqlite.exec('DROP TRIGGER trg_parent_order_node_update');
  host.sqlite.exec(CURRENT_PARENT_ORDER_SCHEMA[4]!.replace(/\s+WHEN[\s\S]*? BEGIN/, ' BEGIN'));
  host.sqlite.pragma('user_version=109');
  const pending = () => host.sqlite.prepare('SELECT parent_id FROM parent_order_projection_pending').all();
  const before = pending();
  await expect(host.port.transaction(tx => migrateCompanionDatabase(tx, 109, 110,
    () => { throw new Error('interrupted'); }))).rejects.toThrow('interrupted');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(109);
  await host.port.transaction(tx => migrateCompanionDatabase(tx, 109, 110));
  expect(pending()).toEqual(before);
  host.save('Companion upgraded body');
  expect(pending()).toEqual(before);
});
