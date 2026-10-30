// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { parentOrderId, writeParentChildOrder } from '../../lib/core/database/parentChildOrder.js';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { desktopDailyFlowPersistence, openDesktopDailyFlow } from './dailyFlow.js';
import { prepareDesktopNodeIndex, readDesktopNodeIndex, releaseDesktopNodeIndex } from './desktopNodeIndex.js';
import * as indexChanges from './desktopNodeIndexChanges.js';
import { initializeDatabase } from './migrate.js';
import { moveNodes, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

let root = '';
vi.mock('../deviceAnchorStore.js', () => ({ loadDesktopLibraryWriterBinding: (libraryPath: string) =>
  ({ deviceAnchor: 'desktop-index', libraryPath }) }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
const now = '2026-10-28T08:00:00.000Z';
const settings = { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };

beforeEach(async () => {
  await fs.mkdir('.tmp/artifacts/T590', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T590/desktop-'));
  initializeDatabase();
  for (const id of ['a', 'b', 'c']) add(id);
  writeParentChildOrder(openDatabaseConnection().driver, parentOrderId(null), ['c', 'a', 'b'], now);
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

function add(id: string, parentNodeId: string | null = null) {
  upsertNodeSnapshot({ nodeId: id, title: `Title ${id}`, kind: 'topic', parentNodeId,
    content: `Complete body ${id}`, reveal: null, isTitleManual: true, anchorLink: null,
    position: 0, createdAt: now, updatedAt: now });
}

function reset() {
  openDatabaseConnection().sqlite.exec('DELETE FROM daily_flow_state; DELETE FROM daily_flow_entries; DELETE FROM daily_flow_operations');
}

async function generate(mode: 'recommended' | 'reading-only' | 'review-first' = 'recommended') {
  reset();
  const opened = await openDesktopDailyFlow({ now, mode, prepareOnly: true });
  const connection = openDatabaseConnection();
  const rows = connection.sqlite.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all();
  const reader = new Database(connection.dbPath, { readonly: true });
  try { expect(reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows); }
  finally { reader.close(); }
  return { session: opened.session, rows };
}

it('reuses directory facts for a complete first generation without reading or projecting nodes again', async () => {
  const { sqlite } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const db = createBetterSqliteDbPort(sqlite);
  const queries = vi.spyOn(db, 'query');
  const result = await openDailyFlow(db, { now, mode: 'recommended' }, settings, desktopDailyFlowPersistence);
  const rows = sqlite.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all() as { node_id: string }[];
  expect(rows.map(row => row.node_id).sort()).toEqual(['a', 'b', 'c']);
  expect(result.session.totalNodeCount).toBe(3);
  expect(queries.mock.calls.filter(([sql]) => !sql.includes('WHERE n.id IN')
    && /SELECT n.id, n.parent_id|SELECT parent_id, child_ids_json/u.test(sql))).toEqual([]);
  const first = await generate();
  releaseDesktopNodeIndex(sqlite);
  expect(await generate()).toEqual(first);
});

it('uses committed moves, root order, deletion, restore and same-count replacements', async () => {
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const { sqlite, driver } = openDatabaseConnection();
  add('source');
  sqlite.prepare("UPDATE nodes SET kind='folder' WHERE id='source'").run();
  const before = readMoveParentOrder(driver, null).visibleIds;
  moveNodes({ maintainSequentialReading: false, defaultPriority: 5,
    nodes: [{ nodeId: 'b', expectedParentNodeId: null, parentNodeId: 'source', updatedAt: now }],
    parentOrders: [{ parentNodeId: null, expectedChildIds: before, childIds: before.filter(id => id !== 'b') },
      { parentNodeId: 'source', expectedChildIds: [], childIds: ['b'] }] });
  await generate();
  expect(readDesktopNodeIndex(sqlite)!.paths.get('b')).toEqual(['source', 'b']);
  writeParentChildOrder(driver, parentOrderId(null), ['a', 'source', 'c'], now);
  await generate();
  expect(readDesktopNodeIndex(sqlite)!.nodeOrder.filter(id => ['a', 'b', 'c'].includes(id))).toEqual(['a', 'b', 'c']);
  softDeleteNodes({ nodeIds: ['source'], deletedAt: now });
  expect((await generate()).rows.map(row => (row as { node_id: string }).node_id).sort()).toEqual(['a', 'c']);
  restoreNodes({ nodeIds: ['source'] });
  expect((await generate()).rows).toHaveLength(3);
  sqlite.transaction(() => { sqlite.prepare("DELETE FROM nodes WHERE id='c'").run(); add('d'); })();
  expect((await generate()).rows.map(row => (row as { node_id: string }).node_id).sort()).toEqual(['a', 'b', 'd']);
});

it('does not publish uncommitted facts or leak a rejected outer transaction into the owner', async () => {
  const { sqlite } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const first = await generate();
  const db = createBetterSqliteDbPort(sqlite);
  await expect(db.transaction(async tx => {
    await tx.run("UPDATE nodes SET priority=0,parent_id='a' WHERE id='b'");
    const facts = await desktopDailyFlowPersistence.learningSnapshot(tx);
    expect(facts.nodesById.b).toMatchObject({ priority: 0, parentNodeId: 'a' });
    expect(readDesktopNodeIndex(sqlite)).toBeNull();
    throw new Error('reject outer transaction');
  })).rejects.toThrow('reject outer transaction');
  expect(readDesktopNodeIndex(sqlite)!.paths.get('b')).toEqual(['b']);
  expect(await generate()).toEqual(first);
});

it('keeps fresh learning temporary and updates default priority without replacing node facts or paths', async () => {
  const { sqlite } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const index = readDesktopNodeIndex(sqlite)!;
  sqlite.prepare("INSERT INTO node_reading (node_id,last_handled_at,next_at,repetition_count) VALUES ('a',?,?,8)").run(now, now);
  const db = createBetterSqliteDbPort(sqlite);
  const facts = await desktopDailyFlowPersistence.learningSnapshot(db);
  expect(facts.nodesById.a?.reading?.repetitionCount).toBe(8);
  const updated = prepareDesktopNodeIndex(sqlite, 9);
  expect(updated.metadata).toBe(index.metadata);
  expect(updated.paths.get('b')).toBe(index.paths.get('b'));
  expect(updated.priorities.get('b')).toBe(9);
  expect(updated.metadata.get('a')).not.toHaveProperty('reading');
  expect(updated.metadata.get('a')).not.toHaveProperty('content');
});

it('never merges an independent old snapshot with current owned node metadata', async () => {
  const { sqlite, dbPath } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const reader = new Database(dbPath, { readonly: true });
  try {
    await createBetterSqliteDbPort(reader, { transactionMode: 'deferred' }).transaction(async tx => {
      await tx.query('SELECT * FROM nodes');
      sqlite.prepare("UPDATE nodes SET priority=0 WHERE id='b'").run();
      await generate();
      const snapshot = await desktopDailyFlowPersistence.learningSnapshot(tx);
      expect(snapshot.nodesById.b?.priority).toBeNull();
      expect(readDesktopNodeIndex(sqlite)!.metadata.get('b')?.priority).toBe(0);
    });
  } finally { reader.close(); }
});

it('keeps a pinned list consistent and refreshes its metadata after an external commit', () => {
  loadWorkspaceListSnapshot();
  const { sqlite, driver, dbPath } = openDatabaseConnection();
  const writer = new Database(dbPath);
  const query = driver.queryAll.bind(driver);
  let committed = false;
  const spy = vi.spyOn(driver, 'queryAll').mockImplementation(<Row extends DatabaseRow>(...args: Parameters<typeof query>) => {
    const rows = query<Row>(...args);
    if (!committed && args[0].includes('FROM nodes n')) {
      writer.prepare("UPDATE nodes SET priority=0,title='External b' WHERE id='b'").run();
      committed = true;
    }
    return rows;
  });
  try {
    expect(loadWorkspaceListSnapshot().nodesById.b?.title).toBe('Title b');
    expect(committed).toBe(true);
    const prepared = readDesktopNodeIndex(sqlite);
    expect(prepared === null || prepared.metadata.get('b')?.priority === 0).toBe(true);
    expect(loadWorkspaceListSnapshot().nodesById.b?.title).toBe('External b');
    expect(readDesktopNodeIndex(sqlite)!.metadata.get('b')?.priority).toBe(0);
  } finally { spy.mockRestore(); writer.close(); }
});

it('invalidates metadata after a different connection commits without borrowing its uncommitted facts', async () => {
  const { sqlite, dbPath } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  const writer = new Database(dbPath);
  try {
    writer.exec("BEGIN IMMEDIATE; UPDATE nodes SET kind='folder' WHERE id='a'");
    expect(readDesktopNodeIndex(sqlite)!.metadata.get('a')?.kind).toBe('topic');
    writer.exec('COMMIT');
    expect(readDesktopNodeIndex(sqlite)).toBeNull();
    expect((await generate()).rows.map(row => (row as { node_id: string }).node_id).sort()).toEqual(['b', 'c']);
  } finally { writer.close(); }
});

it('refreshes eligibility flags and never retains the old index after a failed refresh', async () => {
  const { sqlite } = openDatabaseConnection();
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  sqlite.prepare("UPDATE nodes SET shelved_at=? WHERE id='a'").run(now);
  sqlite.prepare("UPDATE nodes SET content='',body_blob_hash=NULL WHERE id='b'").run();
  sqlite.prepare("UPDATE nodes SET kind='item',reveal='Answer',anchor_link=?,anchor_resolution_status='unmapped_missing' WHERE id='c'")
    .run(JSON.stringify({ kind: 'text-excerpt' }));
  const read = vi.spyOn(indexChanges, 'readDesktopIndexNodes').mockImplementationOnce(() => { throw new Error('read failed'); });
  expect(() => prepareDesktopNodeIndex(sqlite, 5)).toThrow('read failed');
  expect(readDesktopNodeIndex(sqlite)).toBeNull();
  read.mockRestore();
  const updated = prepareDesktopNodeIndex(sqlite, 5);
  expect(updated.metadata.get('a')?.shelvedAt).toBe(now);
  expect(updated.metadata.get('b')?.hasContent).toBe(false);
  expect(updated.metadata.get('c')).toMatchObject({ kind: 'item', hasReveal: true, anchorKind: null });
  expect((await generate()).rows.map(row => (row as { node_id: string }).node_id)).toEqual(['c']);
});

it('releases the index on close and keeps existing-list reopen independent of a cold index', async () => {
  const first = await generate();
  const old = openDatabaseConnection().sqlite;
  closeDatabaseConnection();
  expect(readDesktopNodeIndex(old)).toBeNull();
  const connection = openDatabaseConnection();
  expect(readDesktopNodeIndex(connection.sqlite)).toBeNull();
  const reopened = await openDesktopDailyFlow({ now, mode: 'recommended', prepareOnly: true });
  expect(reopened.session).toEqual(first.session);
  expect(readDesktopNodeIndex(connection.sqlite)).toBeNull();
  const originalRoot = root;
  closeDatabaseConnection();
  root = await fs.mkdtemp(path.resolve('.tmp/artifacts/T590/other-library-'));
  try {
    initializeDatabase(); add('a'); add('b');
    openDatabaseConnection().sqlite.prepare("UPDATE nodes SET parent_id='a',priority=0 WHERE id='b'").run();
    await generate();
    expect(readDesktopNodeIndex(openDatabaseConnection().sqlite)!.paths.get('b')).toEqual(['a', 'b']);
  } finally { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); root = originalRoot; }
});

it('shares the original complete order rather than the display order that removes deleted slots', async () => {
  const { sqlite } = openDatabaseConnection();
  sqlite.prepare("UPDATE nodes SET deleted_at=? WHERE id='c'").run(now);
  const display = loadWorkspaceListSnapshot({ includePdfOpenings: false });
  expect(display.nodeOrder).not.toContain('c');
  const prepared = readDesktopNodeIndex(sqlite)!;
  expect(prepared.nodeOrder.filter(id => ['a', 'b', 'c'].includes(id))).toEqual(['c', 'a', 'b']);
  const warm = await generate();
  releaseDesktopNodeIndex(sqlite);
  expect(await generate()).toEqual(warm);
  expect(readDesktopNodeIndex(sqlite)!.nodeOrder).toEqual(prepared.nodeOrder);
});

it.each(['recommended', 'review-first', 'reading-only'] as const)('preserves complete current and later-today membership in %s with a cold or directory-prepared owner', async mode => {
  const { sqlite } = openDatabaseConnection();
  sqlite.prepare("UPDATE nodes SET kind='item',reveal='Answer',priority=0 WHERE id='c'").run();
  sqlite.prepare("INSERT INTO node_review (node_id,due) VALUES ('c',?)").run(now);
  sqlite.prepare("INSERT INTO node_reading (node_id,last_handled_at,next_at) VALUES ('a',?,?)")
    .run(now, '2026-10-28T08:01:00.000Z');
  const cold = await generate(mode);
  expect(cold.rows.map(row => (row as { node_id: string }).node_id).sort()).toEqual(['a', 'b', 'c']);
  const initial = (cold.rows as { node_id: string; initial_task: number }[])
    .filter(row => row.initial_task).map(row => row.node_id).sort();
  expect(initial).toEqual(mode === 'reading-only' ? ['b'] : ['c']);
  releaseDesktopNodeIndex(sqlite);
  loadWorkspaceListSnapshot({ includePdfOpenings: false });
  expect(await generate(mode)).toEqual(cold);
});
