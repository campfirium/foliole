// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SYNC_PACK_DEPENDENCY_STAGING_SCHEMA } from '../../lib/core/database/syncPackDependencyStagingSchema.js';
import { stageSyncPackDependencyPage } from '../../lib/core/sync/syncPackDependencyStaging.js';
import {
  advanceSyncPackDependencyDigest, SYNC_PACK_DEPENDENCY_INITIAL_DIGEST
} from '../../lib/core/sync/syncPackDependencyTransfer.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { readSyncPackDependencyPage } from './syncPackDependencyRows.js';
import { describeSyncPackDependencySource, iterateSyncPackDependencyPages } from './syncPackDependencySource.js';
import { createSyncPackSourceView, openSyncPackSourceView } from './syncPackSourceView.js';

let root: string;
let source: Database.Database;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-source-view-'));
  source = new Database(path.join(root, 'live.db'));
  source.pragma('journal_mode = WAL');
  source.pragma('wal_autocheckpoint = 0');
  source.exec(`CREATE TABLE sync_state_sequence
    (singleton_id INTEGER PRIMARY KEY, source_epoch TEXT, high_water INTEGER);
    INSERT INTO sync_state_sequence VALUES (1, 'epoch', 23);
    CREATE TABLE nodes (id TEXT PRIMARY KEY, current_version_id TEXT);
    INSERT INTO nodes VALUES ('article', 'v23');
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT,
      parent_version_id TEXT, host_name TEXT, created_at TEXT, content_hash TEXT,
      body_text TEXT, snapshot_json TEXT);
    CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT,
      ordinal INTEGER, PRIMARY KEY (version_id, ordinal));`);
  const body = 'b'.repeat(741 * 1024);
  source.transaction(() => {
    for (let i = 1; i <= 23; i++) {
      const id = `v${String(i).padStart(2, '0')}`;
      const parent = i === 1 ? null : `v${String(i - 1).padStart(2, '0')}`;
      source.prepare('INSERT INTO node_sync_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, 'article', parent, 'host', 'now', `hash-${id}`, body, '{"id":"article","content":null}');
      if (parent) source.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(id, parent);
    }
  })();
});

afterEach(async () => {
  source.close();
  await fs.rm(root, { recursive: true, force: true });
});

it('pages 23 heavy versions from a durable view while the live source changes', async () => {
  const filePath = path.join(root, 'view.db');
  let view = await createSyncPackSourceView(source, filePath);
  const identity = { sourceViewId: view.sourceViewId, sourceEpoch: view.sourceEpoch,
    frontierStateSeq: view.frontierStateSeq };
  expect(identity).toMatchObject({ sourceEpoch: 'epoch', frontierStateSeq: 23 });
  const budget = { rows: 128, payloadBytes: 2 * 1024 * 1024 };
  let page = readSyncPackDependencyPage(view.driver, {
    table: 'node_sync_versions', objectId: 'article', budget
  });
  expect(page.complete).toBe(false);
  expect(page.rows.length).toBeGreaterThan(0);
  const ids = page.rows.map((row) => row.payload.version_id);
  source.exec(`UPDATE node_sync_versions SET body_text = 'edited' WHERE version_id = 'v20';
    DELETE FROM node_sync_version_parents WHERE version_id = 'v21';
    DELETE FROM node_sync_versions WHERE version_id = 'v21';
    UPDATE sync_state_sequence SET high_water = 24;`);
  view.close();
  view = openSyncPackSourceView(filePath, identity);
  try {
    while (!page.complete) {
      page = readSyncPackDependencyPage(view.driver, {
        table: 'node_sync_versions', objectId: 'article', after: page.next!, budget
      });
      expect(page.payloadBytes).toBeLessThanOrEqual(budget.payloadBytes);
      for (const row of page.rows) {
        expect((row.payload.body_text as string).length).toBe(741 * 1024);
        ids.push(row.payload.version_id);
      }
    }
    expect(ids).toEqual(Array.from({ length: 23 }, (_, i) => `v${String(i + 1).padStart(2, '0')}`));
    expect(view.driver.queryOne('SELECT high_water FROM sync_state_sequence')).toEqual({ high_water: 23 });
    expect(() => view.driver.execute('DELETE FROM nodes')).toThrow();
  } finally { view.close(); }
});

it('does not materialize a body that cannot fit the remaining byte budget', async () => {
  const view = await createSyncPackSourceView(source, path.join(root, 'view.db'));
  const spy = vi.spyOn(view.driver, 'queryOne');
  try {
    expect(() => readSyncPackDependencyPage(view.driver, {
      table: 'node_sync_versions', objectId: 'article', budget: { rows: 128, payloadBytes: 100 }
    })).toThrow('sync_pack_dependency_row_exceeds_budget');
    expect(spy).not.toHaveBeenCalled();
  } finally { view.close(); }
});

it('replays relation pages and refuses a different source view identity', async () => {
  const filePath = path.join(root, 'view.db');
  const view = await createSyncPackSourceView(source, filePath);
  try {
    const request = { table: 'node_sync_version_parents' as const, objectId: 'article',
      budget: { rows: 3, payloadBytes: 1024 } };
    const first = readSyncPackDependencyPage(view.driver, request);
    expect(first.rows).toHaveLength(3);
    expect(readSyncPackDependencyPage(view.driver, request)).toEqual(first);
    const next = readSyncPackDependencyPage(view.driver, { ...request, after: first.next! });
    expect(next.rows[0]?.position).not.toEqual(first.rows[0]?.position);
    expect(() => openSyncPackSourceView(filePath, { ...view, sourceViewId: 'other' }))
      .toThrow('sync_pack_source_view_changed');
    await expect(createSyncPackSourceView(source, filePath)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readSyncPackDependencyPage(view.driver, request)).toEqual(first);
  } finally { view.close(); }
});

it('stages the same 23 heavy versions and all parent relations through bounded pages and restart', async () => {
  const view = await createSyncPackSourceView(source, path.join(root, 'view.db'));
  const targetPath = path.join(root, 'target.db');
  let target = new Database(targetPath);
  for (const sql of SYNC_PACK_DEPENDENCY_STAGING_SCHEMA) target.exec(sql);
  const args = { view, objectId: 'article', objectType: 'node' as const,
    budget: { rows: 128, payloadBytes: 2 * 1024 * 1024 } };
  try {
    const description = describeSyncPackDependencySource(args);
    expect(description.expectedRows).toBe(45);
    const transfer = { ...description, sourceViewId: view.sourceViewId, sourceEpoch: view.sourceEpoch,
      groupId: 'group', peerId: 'peer', objectId: 'article', objectType: 'node' as const,
      fromStateSeq: 0, objectStateSeq: 23, frontierStateSeq: view.frontierStateSeq };
    let afterRow = 0;
    let beforeDigest = SYNC_PACK_DEPENDENCY_INITIAL_DIGEST;
    let pageCount = 0;
    for (const rows of iterateSyncPackDependencyPages(args)) {
      expect(rows.reduce((bytes, row) => bytes + Buffer.byteLength(row.json), 0))
        .toBeLessThanOrEqual(args.budget.payloadBytes);
      const afterDigest = rows.reduce(advanceSyncPackDependencyDigest, beforeDigest);
      const page = { transfer, rows, afterRow, beforeDigest, afterDigest };
      const result = await stageSyncPackDependencyPage(createBetterSqliteDbPort(target), page);
      expect(result.completed).toBe(afterRow + rows.length === description.expectedRows);
      if (pageCount === 0) {
        target.close();
        target = new Database(targetPath);
        expect(await stageSyncPackDependencyPage(createBetterSqliteDbPort(target), page))
          .toMatchObject({ replay: true, nextRow: result.nextRow });
      }
      afterRow = result.nextRow;
      beforeDigest = afterDigest;
      pageCount++;
    }
    expect(pageCount).toBeGreaterThan(1);
    expect(afterRow).toBe(45);
    expect(target.prepare(`SELECT next_row, completed FROM sync_pack_dependency_transfers`).get())
      .toEqual({ next_row: 45, completed: 1 });
    expect(target.prepare(`SELECT count(*) AS count FROM sync_pack_dependency_rows
      WHERE table_name = 'node_sync_versions' AND
        length(json_extract(payload_json, '$.body_text')) = ?`).get(741 * 1024))
      .toEqual({ count: 23 });
  } finally { target.close(); view.close(); }
});

it('pages review operations by immutable ID and excludes other articles', async () => {
  source.exec(`CREATE TABLE review_log (id TEXT PRIMARY KEY, op_id TEXT UNIQUE,
    host_name TEXT, node_id TEXT, grade INTEGER, scheduler_version TEXT, reviewed_at TEXT,
    due_before TEXT, stability_before REAL, difficulty_before REAL,
    due_after TEXT, stability_after REAL, difficulty_after REAL)`);
  for (let i = 0; i < 8; i++) {
    source.prepare(`INSERT INTO review_log VALUES (?, ?, 'host', ?, 3, 'scheduler',
      'now', 'before', 1, 2, 'after', 3, 4)`)
      .run(`id-${i}`, `op-${i}`, i === 7 ? 'unrelated' : 'article');
  }
  const view = await createSyncPackSourceView(source, path.join(root, 'reviews.db'));
  try {
    const args = { table: 'review_log' as const, objectId: 'article',
      budget: { rows: 2, payloadBytes: 1024 } };
    let page = readSyncPackDependencyPage(view.driver, args);
    const ids = page.rows.map((row) => row.payload.op_id);
    while (!page.complete) {
      page = readSyncPackDependencyPage(view.driver, { ...args, after: page.next! });
      ids.push(...page.rows.map((row) => row.payload.op_id));
    }
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `op-${i}`));
  } finally { view.close(); }
});
