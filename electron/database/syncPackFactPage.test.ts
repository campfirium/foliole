// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { probeSyncPackFactPresence } from '../../lib/core/sync/syncPackFactPresence.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { readDesktopSyncPackFactPage, type SyncPackFactPosition } from './syncPackFactPage.js';
import { createSyncPackSourceView } from './syncPackSourceView.js';

let root: string;
let source: Database.Database;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-fact-pages-'));
  source = new Database(path.join(root, 'source.db'));
  initializeDatabaseSchema(source);
});
afterEach(async () => { source.close(); await fs.rm(root, { recursive: true, force: true }); });

function seedNode(id: string, parent: string | null, count: number, stateSeq: number) {
  source.prepare(`INSERT INTO nodes (id, parent_id, kind, title, created_at, updated_at)
    VALUES (?, ?, 'topic', ?, 'now', 'now')`).run(id, parent, id);
  for (let i = 0; i < count; i++) {
    const version = `${id}-${String(i).padStart(4, '0')}`;
    const previous = i ? `${id}-${String(i - 1).padStart(4, '0')}` : null;
    source.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, ?, ?, 'source', 'now', ?, ?, '{"content":null}')`)
      .run(version, id, previous, `hash-${version}`, `body-${version}`);
    if (previous) source.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(version, previous);
    source.prepare('UPDATE nodes SET current_version_id = ? WHERE id = ?').run(version, id);
  }
  source.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('node', ?, ?, 'hash', 'now', 0, 'source')`).run(id, stateSeq);
}

function seedReviewLog() {
  source.exec(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, updated_at, sync_dirty, last_modified_by_host_name)
    VALUES ('node_review', 'child', 2, 'review-hash', 'now', 0, 'source')`);
  const insert = source.prepare(`INSERT INTO review_log
    (id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
     due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after)
    VALUES (?, ?, 'source', 'child', 3, 'scheduler', 'now', 'before', 1, 2, 'after', 3, 4)`);
  for (let i = 0; i < 260; i++) insert.run(`review-${i}`, `op-${String(i).padStart(4, '0')}`);
}

it('pages 129 historical versions, parent prelude, and 260 reviews from one stable view', async () => {
  seedNode('parent', null, 2, 0);
  seedNode('child', 'parent', 129, 1);
  seedNode('unrelated', null, 180, 3);
  seedReviewLog();
  const view = await createSyncPackSourceView(source, path.join(root, 'view.db'));
  const window = { fromStateSeq: 0, toStateSeq: 2, frontierStateSeq: view.frontierStateSeq,
    sourceEpoch: view.sourceEpoch };
  const pages = [];
  let after: SyncPackFactPosition | undefined;
  try {
    source.exec("DELETE FROM review_log; UPDATE node_sync_versions SET body_text = 'changed';");
    for (let turn = 0; turn < 20; turn++) {
      const page = readDesktopSyncPackFactPage(view.driver, window, after);
      expect(page.index.versions.length + page.index.parents.length + page.index.reviews.length).toBeLessThanOrEqual(128);
      expect(Buffer.byteLength(JSON.stringify(page.index))).toBeLessThan(257 * 1024);
      pages.push(page.index);
      if (page.complete) break;
      after = page.next!;
    }
    expect(pages.flatMap((page) => page.versions)).toHaveLength(131);
    expect(pages.flatMap((page) => page.parents)).toHaveLength(129);
    expect(pages.flatMap((page) => page.reviews)).toHaveLength(260);
    expect(pages.flatMap((page) => page.versions).some((fact) => fact.object_id === 'unrelated')).toBe(false);
    expect(pages.at(-1)?.reviews.at(-1)?.op_id).toBe('op-0259');
  } finally { view.close(); }
});

it('probes each page independently and still requests collected bodies and missing parent edges', async () => {
  seedNode('node', null, 140, 1);
  const view = await createSyncPackSourceView(source, path.join(root, 'view.db'));
  source.exec("UPDATE node_sync_versions SET body_text = NULL WHERE version_id = 'node-0001';");
  source.exec("DELETE FROM node_sync_version_parents WHERE version_id = 'node-0130';");
  let after: SyncPackFactPosition | undefined;
  const held = { versions: [] as string[], parents: [] as string[] };
  try {
    for (let turn = 0; turn < 10; turn++) {
      const page = readDesktopSyncPackFactPage(view.driver, { fromStateSeq: 0, toStateSeq: 1,
        frontierStateSeq: view.frontierStateSeq, sourceEpoch: view.sourceEpoch }, after);
      const claims = await probeSyncPackFactPresence(createBetterSqliteDbPort(source), page.index);
      held.versions.push(...claims.versions);
      held.parents.push(...claims.parents);
      if (page.complete) break;
      after = page.next!;
    }
    expect(held.versions).toHaveLength(139);
    expect(held.versions).not.toContain('node-0001');
    expect(held.parents).toHaveLength(138);
    expect(held.parents).not.toContain(JSON.stringify(['node-0130', 'node-0129', 0]));
  } finally { view.close(); }
});

it('pages node history when the changed object is its open state', async () => {
  seedNode('node', null, 132, 1);
  source.exec("UPDATE sync_object_state SET object_type = 'node_open_state' WHERE object_id = 'node'");
  const view = await createSyncPackSourceView(source, path.join(root, 'view.db'));
  try {
    const window = { fromStateSeq: 0, toStateSeq: 1,
      frontierStateSeq: view.frontierStateSeq, sourceEpoch: view.sourceEpoch };
    const first = readDesktopSyncPackFactPage(view.driver, window);
    expect(first.complete).toBe(false);
    expect(first.index.versions.length).toBe(128);
    let after = first.next!;
    let total = first.index.versions.length;
    for (let turn = 0; turn < 4; turn++) {
      const page = readDesktopSyncPackFactPage(view.driver, window, after);
      total += page.index.versions.length;
      if (page.complete) break;
      after = page.next!;
    }
    expect(total).toBe(132);
  } finally { view.close(); }
});

it('checks source row bytes before materializing a body that exceeds the page budget', () => {
  seedNode('node', null, 1, 1);
  source.prepare('UPDATE node_sync_versions SET body_text = ?').run('x'.repeat(2 * 1024 * 1024 + 1));
  const driver = createBetterSqlite3Driver(source);
  let materialized = false;
  const guarded: DatabaseDriver = { ...driver, queryOne: (sql, params) => {
    if (sql.includes('body_text')) materialized = true;
    return driver.queryOne(sql, params);
  } };
  expect(() => readDesktopSyncPackFactPage(guarded, { fromStateSeq: 0, toStateSeq: 1,
    frontierStateSeq: 1, sourceEpoch: 'epoch' })).toThrow('sync_pack_fact_row_exceeds_budget');
  expect(materialized).toBe(false);
});
