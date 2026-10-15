// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { CURRENT_PARENT_ORDER_SCHEMA, PARENT_ORDER_PAYLOAD_SQL } from '../../lib/core/database/currentParentOrderSchema.js';
import { flushCurrentParentOrderProjections, readCurrentParentOrderSources,
  saveLocalCurrentParentOrder } from '../../lib/core/database/currentParentOrderStore.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { bindParentOrderWriter, requireParentOrderWriter } from '../../lib/core/database/parentOrderWriter.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { currentParentOrderHash, currentParentOrderPayload, type ParentOrderSource } from '../../lib/core/sync/currentParentOrder.js';
import { applyCurrentParentOrderRecord, flushCurrentParentOrderProjectionsWithDbPort,
  saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore.js';
import { bindParentOrderWriterWithDbPort } from '../../lib/core/sync/parentOrderWriter.js';

import { finishLocalOnlyBackupRestore } from './backupRestoreSyncSelection.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { captureBackupRestoreHostSettings } from './syncGroupBackupRestore.js';

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const now = '2026-10-11T00:00:00Z';

function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  initializeDatabaseSchema(db);
  for (const sql of CURRENT_PARENT_ORDER_SCHEMA) db.exec(sql);
  const driver = createBetterSqlite3Driver(db);
  const port = createBetterSqliteDbPort(db);
  bindParentOrderWriter(driver, { deviceAnchor: 'anchor-a', libraryPath: '/a/library' });
  const parent = db.prepare(`INSERT INTO nodes
    (id, kind, title, content, created_at, updated_at) VALUES (?, 'folder', ?, '', ?, ?)`);
  for (const id of ['parent', 'other']) parent.run(id, id, now, now);
  const insert = db.prepare(`INSERT INTO nodes
    (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES (?, 'parent', 'topic', ?, '', ?, ?)`);
  const node = (id: string) => insert.run(id, id, now, now);
  const save = (childIds: string[]) => saveLocalCurrentParentOrder(driver,
    { parentId: 'parent', childIds, now, hostName: 'same-host' });
  const order = () => JSON.parse(String(db.prepare(
    "SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'parent'").pluck().get()));
  return { db, driver, port, node, save, order };
}

function record(sources: ParentOrderSource[]) {
  return { object_type: 'parent_child_order', object_id: 'parent', deleted_at: null,
    payload_json: JSON.stringify(currentParentOrderPayload('parent', sources)), updated_at: now,
    content_hash: currentParentOrderHash('parent', sources) };
}

it('preserves root membership when a child moves out of a folder through either storage adapter', async () => {
  const host = fixture();
  host.node('a');
  const rootOrder = () => JSON.parse(String(host.db.prepare(
    "SELECT child_ids_json FROM parent_child_order WHERE parent_id = 'parent-child-order:root'").pluck().get()));
  await flushCurrentParentOrderProjectionsWithDbPort(host.port);
  expect(rootOrder()).toEqual(['other', 'parent']);
  host.db.prepare("UPDATE nodes SET parent_id = NULL WHERE id = 'a'").run();
  flushCurrentParentOrderProjections(host.driver);
  expect(rootOrder()).toEqual(['a', 'other', 'parent']);
  expect(host.order()).toEqual([]);
});

it('uses the same persistent writer and logical ordering through the async Companion port', async () => {
  const host = fixture();
  host.node('a'); host.node('b');
  const binding = { deviceAnchor: 'anchor-a', libraryPath: '/a/library' };
  expect(await bindParentOrderWriterWithDbPort(host.port, binding)).toBe(requireParentOrderWriter(host.driver));
  await applyCurrentParentOrderRecord(host.port, record([{ authorId: 'remote', counter: 8, childIds: ['b', 'a'] }]));
  const input = { parentId: 'parent', childIds: ['a', 'b'], now, hostName: 'companion' };
  expect(await saveLocalCurrentParentOrderWithDbPort(host.port, input)).toBe(true);
  expect(await saveLocalCurrentParentOrderWithDbPort(host.port, input)).toBe(false);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toContainEqual({
    authorId: requireParentOrderWriter(host.driver), counter: 9, childIds: ['a', 'b']
  });
  expect(host.order()).toEqual(['a', 'b']);
});

it('persists one latest snapshot per author and leaves no-op saves unchanged', () => {
  const host = fixture();
  host.node('a'); host.node('b');
  expect(host.save(['a', 'b'])).toBe(true);
  expect(host.save(['b', 'a'])).toBe(true);
  expect(host.save(['b', 'a'])).toBe(false);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toEqual([
    { authorId: requireParentOrderWriter(host.driver), counter: 2, childIds: ['b', 'a'] }
  ]);
  const payload = JSON.parse(String(host.db.prepare(PARENT_ORDER_PAYLOAD_SQL).pluck().get('parent')));
  expect(typeof payload.sources_json).toBe('string');
  expect(computeSyncContentHash('parent_child_order', payload)).toBe(record(
    readCurrentParentOrderSources(host.driver, 'parent')).content_hash);
});

it('joins a remote source without creating a local edit, then orders the next edit after it', async () => {
  const host = fixture();
  host.node('a'); host.node('b');
  const incoming = record([{ authorId: 'remote', counter: 7, childIds: ['b', 'a'] }]);
  await applyCurrentParentOrderRecord(host.port, incoming);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toHaveLength(1);
  expect(host.order()).toEqual(['b', 'a']);
  const sequence = host.db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get();
  await applyCurrentParentOrderRecord(host.port, incoming);
  expect(host.db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get()).toBe(sequence);
  host.node('c');
  host.save(['b', 'c', 'a']);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toContainEqual({
    authorId: requireParentOrderWriter(host.driver), counter: 8, childIds: ['b', 'c', 'a']
  });
});

it('atomically rejects conflicting same-author facts without committing another source', async () => {
  const host = fixture();
  host.node('a'); host.node('b');
  await applyCurrentParentOrderRecord(host.port, record([{ authorId: 'remote', counter: 7, childIds: ['b', 'a'] }]));
  await expect(applyCurrentParentOrderRecord(host.port, record([
    { authorId: 'other', counter: 8, childIds: ['a', 'b'] },
    { authorId: 'remote', counter: 7, childIds: ['a', 'b'] }
  ]))).rejects.toThrow('collision');
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toEqual([
    { authorId: 'remote', counter: 7, childIds: ['b', 'a'] }
  ]);
  expect(host.order()).toEqual(['b', 'a']);
});

it('reprojects late members, moves and names while preserving original source slots', async () => {
  const host = fixture();
  for (const id of ['a', 'b', 'y']) host.node(id);
  const sources = [{ authorId: 'A', counter: 2, childIds: ['a', 'x', 'b'] },
    { authorId: 'B', counter: 1, childIds: ['a', 'y', 'b'] }];
  await applyCurrentParentOrderRecord(host.port, record(sources));
  host.node('x');
  flushCurrentParentOrderProjections(host.driver);
  expect(host.order()).toEqual(['a', 'x', 'y', 'b']);
  host.db.prepare("UPDATE nodes SET title = 'z' WHERE id = 'x'").run();
  flushCurrentParentOrderProjections(host.driver);
  expect(host.order()).toEqual(['a', 'y', 'x', 'b']);
  host.db.prepare("UPDATE nodes SET parent_id = 'other' WHERE id = 'x'").run();
  flushCurrentParentOrderProjections(host.driver);
  expect(host.order()).toEqual(['a', 'y', 'b']);
  host.db.prepare("UPDATE nodes SET parent_id = 'parent', deleted_at = ? WHERE id = 'x'").run(now);
  flushCurrentParentOrderProjections(host.driver);
  expect(host.order()).toEqual(['a', 'y', 'x', 'b']);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toEqual(sources);
});

it('rotates authors on a changed device, library binding or restore epoch and keeps counters', () => {
  const host = fixture();
  host.node('a'); host.node('b');
  host.save(['a', 'b']);
  const first = requireParentOrderWriter(host.driver);
  expect(bindParentOrderWriter(host.driver, { deviceAnchor: 'anchor-a', libraryPath: '/a/library' })).toBe(first);
  const cloned = bindParentOrderWriter(host.driver, { deviceAnchor: 'anchor-b', libraryPath: '/a/library' });
  expect(cloned).not.toBe(first);
  host.save(['b', 'a']);
  host.db.prepare("UPDATE sync_state_sequence SET source_epoch = 'restored'").run();
  const restored = requireParentOrderWriter(host.driver);
  expect(restored).not.toBe(cloned);
  host.save(['a', 'b']);
  expect(readCurrentParentOrderSources(host.driver, 'parent').map((source) => source.counter).sort()).toEqual([1, 2, 3]);
});

it('rotates the first offline writer after a local-only backup restore', () => {
  const host = fixture();
  host.node('a'); host.node('b');
  host.save(['a', 'b']);
  const before = requireParentOrderWriter(host.driver);
  host.db.exec("INSERT INTO settings VALUES ('host_name', 'Test host', 'now')");
  finishLocalOnlyBackupRestore(host.driver, captureBackupRestoreHostSettings(host.driver));
  host.save(['b', 'a']);
  expect(requireParentOrderWriter(host.driver)).not.toBe(before);
  expect(readCurrentParentOrderSources(host.driver, 'parent')).toHaveLength(2);
});
