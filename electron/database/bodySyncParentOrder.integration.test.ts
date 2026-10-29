// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { CURRENT_PARENT_ORDER_SCHEMA } from '../../lib/core/database/currentParentOrderSchema.js';
import { flushCurrentParentOrderProjections } from '../../lib/core/database/currentParentOrderStore.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { bindParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { flushCurrentParentOrderProjectionsWithDbPort } from '../../lib/core/sync/currentParentOrderStore.js';
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
  const pending = () => sqlite.prepare('SELECT parent_id FROM parent_order_projection_pending').all();
  return { sqlite, driver, port, save, pending };
}

it('does not project directory members for a body save or same-value structure writeback', () => {
  const host = fixture();
  host.save('First body');
  flushCurrentParentOrderProjections(host.driver);
  const reads: string[] = [];
  const driver = { ...host.driver, queryAll: ((sql, params) => {
    reads.push(sql); return host.driver.queryAll(sql, params);
  }) as typeof host.driver.queryAll };
  for (const content of ['New body', 'New body']) {
    host.save(content);
    expect(host.pending()).toEqual([]);
    flushCurrentParentOrderProjections(driver);
  }
  expect(reads.filter(sql => /SELECT id, title, created_at/.test(sql))).toEqual([]);
  expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('New body');
});

it('does not project directory members after a remote body version applies its full snapshot', async () => {
  const host = fixture();
  const first = textBranch('v1', 'Original');
  await applyConvergentSyncNodesWithDbPort(host.port, [first]);
  await flushCurrentParentOrderProjectionsWithDbPort(host.port);
  await applyConvergentSyncNodesWithDbPort(host.port, [textBranch('v2', 'Replacement', first)]);
  expect(host.pending()).toEqual([]);
  expect(host.sqlite.prepare("SELECT content FROM nodes WHERE id='topic'").pluck().get()).toBe('Replacement');
});

it('still schedules actual structural edits including null transitions', () => {
  const host = fixture(); host.save('Body');
  host.sqlite.exec("INSERT INTO nodes (id, kind, title, content, created_at, updated_at) VALUES ('parent', 'folder', 'Parent', '', 'now', 'now')");
  const changes = ["title='Renamed'", "parent_id='parent'", 'parent_id=NULL',
    "deleted_at='2026-10-29'", 'deleted_at=NULL'];
  for (const change of changes) {
    flushCurrentParentOrderProjections(host.driver);
    host.sqlite.exec(`UPDATE nodes SET ${change} WHERE id='topic'`);
    expect(host.pending().length).toBeGreaterThan(0);
  }
  flushCurrentParentOrderProjections(host.driver);
  host.sqlite.exec("DELETE FROM nodes WHERE id='topic'");
  expect(host.pending().length).toBeGreaterThan(0);
});

it('replaces an installed legacy trigger transactionally without clearing pending work', () => {
  const host = fixture(); host.save('Body');
  host.sqlite.exec('DROP TRIGGER trg_parent_order_node_update');
  host.sqlite.exec(CURRENT_PARENT_ORDER_SCHEMA[4]!.replace(/\s+WHEN[\s\S]*? BEGIN/, ' BEGIN'));
  host.sqlite.pragma('user_version=181');
  const pending = host.pending();
  expect(() => initializeDatabaseSchema(host.sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } })).toThrow('interrupted');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(181);
  initializeDatabaseSchema(host.sqlite);
  expect(host.pending()).toEqual(pending);
  flushCurrentParentOrderProjections(host.driver);
  host.save('Upgraded body');
  expect(host.pending()).toEqual([]);
});

it('upgrades the installed companion trigger without rewriting directory state', async () => {
  const host = fixture(); host.save('Body');
  host.sqlite.exec('DROP TRIGGER trg_parent_order_node_update');
  host.sqlite.exec(CURRENT_PARENT_ORDER_SCHEMA[4]!.replace(/\s+WHEN[\s\S]*? BEGIN/, ' BEGIN'));
  host.sqlite.pragma('user_version=109');
  const pending = host.pending();
  await expect(host.port.transaction(tx => migrateCompanionDatabase(tx, 109, 110,
    () => { throw new Error('interrupted'); }))).rejects.toThrow('interrupted');
  expect(host.sqlite.pragma('user_version', { simple: true })).toBe(109);
  await host.port.transaction(tx => migrateCompanionDatabase(tx, 109, 110));
  expect(host.pending()).toEqual(pending);
  await flushCurrentParentOrderProjectionsWithDbPort(host.port);
  host.save('Companion upgraded body');
  expect(host.pending()).toEqual([]);
});
