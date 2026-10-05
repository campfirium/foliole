// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import {
  projectDesktopFramedSyncParentRelation,
  projectDesktopFramedSyncReview,
  type DesktopFramedSyncReviewSource
} from '../sync/desktopFramedSyncRelationReviewProjection.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { applyDesktopFramedSyncRelationReviewFactsWithDbPort } from './desktopFramedSyncRelationReviewApply.js';

let sqlite: Database.Database;
let port: DbPort;

const baseReview: DesktopFramedSyncReviewSource = {
  difficulty_after: 3.75, difficulty_before: 2.25,
  due_after: '2026-10-08T01:00:00Z', due_before: '2026-10-06T01:00:00Z',
  grade: 3, host_name: 'device-a', id: 'review-row-1', node_id: 'node-1',
  op_id: 'review-op-1', reviewed_at: '2026-10-05T01:00:00Z',
  scheduler_version: 'fsrs-6', stability_after: 4.5, stability_before: 2.5
};

function parent(parentVersionId: string, ordinal: number) {
  return projectDesktopFramedSyncParentRelation({
    object_id: 'node-1', ordinal, parent_version_id: parentVersionId,
    version_id: 'version-child'
  });
}

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE nodes (id TEXT PRIMARY KEY);
    CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL);
    CREATE TABLE node_sync_version_parents (
      version_id TEXT NOT NULL, parent_version_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
      local_note TEXT DEFAULT 'local-parent',
      PRIMARY KEY (version_id, parent_version_id), UNIQUE (version_id, ordinal)
    );
    CREATE TABLE review_log (
      id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, host_name TEXT NOT NULL,
      node_id TEXT NOT NULL, grade INTEGER NOT NULL, scheduler_version TEXT NOT NULL,
      reviewed_at TEXT NOT NULL, due_before TEXT NOT NULL, stability_before REAL NOT NULL,
      difficulty_before REAL NOT NULL, due_after TEXT NOT NULL, stability_after REAL NOT NULL,
      difficulty_after REAL NOT NULL, local_note TEXT DEFAULT 'local-review'
    );
    INSERT INTO nodes VALUES ('node-1');
    INSERT INTO node_sync_versions VALUES
      ('version-child', 'node-1'), ('version-parent-a', 'node-1'),
      ('version-parent-b', 'node-1'), ('version-parent-c', 'node-1');`);
  port = createBetterSqliteDbPort(sqlite);
});

afterEach(() => sqlite.close());

async function apply(facts: Parameters<typeof applyDesktopFramedSyncRelationReviewFactsWithDbPort>[1]) {
  return port.transaction((tx) => applyDesktopFramedSyncRelationReviewFactsWithDbPort(tx, facts));
}

it('inserts exact facts, permits independent parent edges, and replays without changing private columns', async () => {
  const review = projectDesktopFramedSyncReview(baseReview);
  await apply([parent('version-parent-a', 0), review]);
  sqlite.exec(`UPDATE node_sync_version_parents SET local_note = 'kept-parent';
    UPDATE review_log SET local_note = 'kept-review';`);

  await apply([parent('version-parent-a', 0), parent('version-parent-b', 1), review]);

  expect(sqlite.prepare(`SELECT parent_version_id, ordinal, local_note
    FROM node_sync_version_parents ORDER BY ordinal`).all()).toEqual([
    { local_note: 'kept-parent', ordinal: 0, parent_version_id: 'version-parent-a' },
    { local_note: 'local-parent', ordinal: 1, parent_version_id: 'version-parent-b' }
  ]);
  expect(sqlite.prepare('SELECT op_id, grade, local_note FROM review_log').all()).toEqual([
    { grade: 3, local_note: 'kept-review', op_id: 'review-op-1' }
  ]);
});

it.each([
  ['same parent at another ordinal', parent('version-parent-a', 1)],
  ['same ordinal for another parent', parent('version-parent-b', 0)]
])('rejects a parent identity conflict: %s', async (_label, conflicting) => {
  await apply([parent('version-parent-a', 0)]);

  await expect(apply([conflicting])).rejects.toThrow('framed_sync_parent_relation_conflict');
  expect(sqlite.prepare('SELECT parent_version_id, ordinal FROM node_sync_version_parents').all())
    .toEqual([{ ordinal: 0, parent_version_id: 'version-parent-a' }]);
});

it('requires every shared review field to match for an op replay', async () => {
  await apply([projectDesktopFramedSyncReview(baseReview)]);
  const variants: DesktopFramedSyncReviewSource[] = [
    { ...baseReview, id: 'other-id' }, { ...baseReview, host_name: 'device-b' },
    { ...baseReview, node_id: 'node-2' }, { ...baseReview, grade: 4 },
    { ...baseReview, scheduler_version: 'fsrs-7' }, { ...baseReview, reviewed_at: 'later' },
    { ...baseReview, due_before: 'earlier' }, { ...baseReview, stability_before: 2.75 },
    { ...baseReview, difficulty_before: 2.5 }, { ...baseReview, due_after: 'later' },
    { ...baseReview, stability_after: 4.75 }, { ...baseReview, difficulty_after: 4 }
  ];
  for (const variant of variants) {
    await expect(apply([projectDesktopFramedSyncReview(variant)]))
      .rejects.toThrow('framed_sync_review_conflict:review-op-1');
  }
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 1 });
});

it('rolls back earlier facts when a later review conflicts in the outer transaction', async () => {
  await apply([projectDesktopFramedSyncReview(baseReview)]);
  const conflict = projectDesktopFramedSyncReview({ ...baseReview, grade: 4 });

  await expect(apply([parent('version-parent-c', 2), conflict]))
    .rejects.toThrow('framed_sync_review_conflict:review-op-1');

  expect(sqlite.prepare("SELECT COUNT(*) AS count FROM node_sync_version_parents WHERE ordinal = 2").get())
    .toEqual({ count: 0 });
  expect(sqlite.prepare('SELECT grade FROM review_log WHERE op_id = ?').get('review-op-1'))
    .toEqual({ grade: 3 });
});
