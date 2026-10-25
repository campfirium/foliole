// @vitest-environment node

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { createCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor';
import { buildReviewQueuePlan } from '../../src/store/reviewQueuePlanner';

import { companionPreviewDatabaseFile } from './android-web-dev.mjs';
import { resetCompanionPreviewReviews } from './companion-preview-reset-reviews.mjs';

let root;
let file;
let db;
const now = '2026-10-25T08:00:00.000Z';

beforeEach(async () => {
  const artifacts = path.resolve('.tmp/artifacts/T456');
  mkdirSync(artifacts, { recursive: true });
  root = realpathSync(mkdtempSync(path.join(artifacts, 'reset-test-')));
  file = companionPreviewDatabaseFile(root, 'device');
  mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  await createCompanionDatabase(createBetterSqliteDbPort(db), 96);
  const insert = db.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run('topic', 'topic', 'Source', 'Original {{cloze}}', now, now);
  insert.run('item', 'item', 'Cloze', 'Original answer', now, now);
  db.prepare("UPDATE nodes SET parent_id = 'topic' WHERE id = 'item'").run();
  for (const id of ['item', 'topic']) {
    db.prepare(`INSERT INTO node_review (node_id, due, state, reps)
      VALUES (?, '2030-01-01T00:00:00.000Z', 2, 5)`).run(id);
    db.prepare(`INSERT INTO review_log VALUES (?, ?, 'Preview', ?, 3, 'fsrs', ?, ?, 2, 3, ?, 4, 5)`)
      .run(id, id, id, now, now, '2030-01-01T00:00:00.000Z');
  }
  db.prepare(`INSERT INTO node_reading (node_id, last_handled_at, next_at, repetition_count)
    VALUES ('topic', ?, '2030-01-01T00:00:00.000Z', 4)`).run(now);
});

afterEach(() => {
  if (db?.open) db.close();
  rmSync(root, { recursive: true, force: true });
});

function itemQueue(database) {
  const nodes = database.prepare(`SELECT n.id, n.parent_id, n.kind, n.content, n.created_at,
    r.due, r.scheduled_days FROM nodes n LEFT JOIN node_review r ON r.node_id = n.id
    WHERE n.kind = 'item'`).all().map(row => ({
    id: row.id, parentNodeId: row.parent_id, kind: row.kind, content: row.content,
    createdAt: row.created_at, review: row.due ? { due: row.due, scheduledDays: row.scheduled_days } : null
  }));
  return buildReviewQueuePlan({ nodeOrder: nodes.map(node => node.id),
    nodesById: Object.fromEntries(nodes.map(node => [node.id, node])), now, trashedNodeIds: [] }).fsrsQueueNodeIds;
}

it('makes reviewed items available after reopening without changing content or topic progress', async () => {
  expect(itemQueue(db)).toEqual([]);
  const nodes = db.prepare('SELECT * FROM nodes ORDER BY id').all();
  const reading = db.prepare('SELECT * FROM node_reading').all();
  const result = await resetCompanionPreviewReviews({ root });
  expect(result).toMatchObject({ states: 1, logs: 1 });
  const backup = new Database(result.backupFile, { readonly: true });
  try {
    expect(itemQueue(backup)).toEqual([]);
    expect(backup.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
  } finally { backup.close(); }
  db.close();
  db = new Database(file);
  expect(itemQueue(db)).toEqual(['item']);
  expect(db.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
  expect(db.prepare('SELECT * FROM node_reading').all()).toEqual(reading);
  expect(db.prepare('SELECT node_id FROM node_review').all()).toEqual([{ node_id: 'topic' }]);
  expect(db.prepare('SELECT node_id FROM review_log').all()).toEqual([{ node_id: 'topic' }]);
  expect(await resetCompanionPreviewReviews({ root })).toMatchObject({ states: 0, logs: 0 });
});

it('rolls back the log deletion if resetting the state fails', async () => {
  db.exec(`CREATE TRIGGER refuse_reset BEFORE DELETE ON node_review
    BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  await expect(resetCompanionPreviewReviews({ root })).rejects.toThrow('test failure');
  expect(db.prepare('SELECT count(*) FROM review_log').pluck().get()).toBe(2);
  expect(itemQueue(db)).toEqual([]);
});

it('refuses a missing preview and never creates a new library', async () => {
  await expect(resetCompanionPreviewReviews({ root: path.join(root, 'missing') })).rejects.toThrow();
});

it('refuses a symbolic link to a different library', async () => {
  const linkRoot = path.join(root, 'linked');
  const link = companionPreviewDatabaseFile(linkRoot, 'device');
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(file, link);
  await expect(resetCompanionPreviewReviews({ root: linkRoot })).rejects.toThrow('symbolic link');
  expect(itemQueue(db)).toEqual([]);
});
