// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCompanionDatabase, migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { migrateCompanionReviewLog, migrateReviewLog } from '../../lib/core/database/reviewLogMigration.js';
import { applyReviewLogRecordsWithDbPort } from '../../lib/core/sync/syncReviewLogApply.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';

const OLD_TABLE = `CREATE TABLE review_log (
  id TEXT PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, host_name TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES nodes(id), grade INTEGER NOT NULL,
  scheduler_version TEXT NOT NULL, reviewed_at TEXT NOT NULL,
  due_before TEXT NOT NULL, stability_before REAL NOT NULL, difficulty_before REAL NOT NULL,
  due_after TEXT NOT NULL, stability_after REAL NOT NULL, difficulty_after REAL NOT NULL)`;

async function fixture(host: string) {
  const sqlite = new Database(':memory:'); const db = createBetterSqliteDbPort(sqlite);
  if (host === 'desktop') initializeDatabaseSchema(sqlite);
  else await createCompanionDatabase(db, COMPANION_DATABASE_VERSION);
  sqlite.exec(`DROP TABLE review_log; ${OLD_TABLE}`);
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) sqlite.exec(sql);
  for (const id of ['ordinary', 'new', 'reset', 'normal']) {
    sqlite.prepare("INSERT INTO nodes(id, kind, title, created_at, updated_at) VALUES (?, 'item', '', 'created', 'updated')").run(id);
    if (id !== 'reset') sqlite.prepare('INSERT INTO node_review VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'current-due', 'current-last', 2, 8, 4, 3, 5, 6, 1);
  }
  const insert = sqlite.prepare('INSERT INTO review_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const row = (node: string, index: number, before: [string, number, number], after: [string, number, number]) => {
    const id = `${node}-${index}`; const time = `2026-05-20T08:00:0${index}.000Z`;
    insert.run(id, id, 'old-host', node, 3, 'old-fsrs', time, ...before, ...after);
  };
  row('ordinary', 1, ['same-before', 1, 2], ['first-after', 3, 4]);
  row('ordinary', 2, ['same-before', 1, 2], ['second-after', 5, 6]);
  row('new', 1, ['2026-05-20T08:00:01.000Z', 0, 0], ['first-after', 3, 4]);
  row('new', 2, ['2026-05-20T08:00:02.000Z', 0, 0], ['second-after', 5, 6]);
  row('reset', 1, ['before', 1, 2], ['after', 3, 4]);
  row('normal', 1, ['before', 1, 2], ['chained', 3, 4]);
  row('normal', 2, ['chained', 3, 4], ['last', 5, 6]);
  restoreEmptyLegacyDailyFlowSchema(sqlite);
  sqlite.pragma(`user_version = ${host === 'desktop' ? 171 : 98}`);
  return { sqlite, db };
}

it.each(['desktop', 'companion'])('upgrades %s history without changing any existing review state', async host => {
  const { sqlite, db } = await fixture(host);
  try {
    const state = sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all();
    const originals = sqlite.prepare('SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at FROM review_log ORDER BY op_id').all();
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => migrateCompanionDatabase(tx, 98, 99));
    expect(sqlite.prepare('SELECT * FROM node_review ORDER BY node_id').all()).toEqual(state);
    expect(sqlite.prepare("SELECT id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at FROM review_log WHERE kind='review' ORDER BY op_id").all()).toEqual(originals);
    expect(sqlite.prepare("SELECT kind, node_id, voids_op_id FROM review_log WHERE kind!='review' ORDER BY op_id").all()).toEqual([
      { kind: 'reset', node_id: 'reset', voids_op_id: null },
      { kind: 'void', node_id: 'new', voids_op_id: 'new-1' },
      { kind: 'void', node_id: 'ordinary', voids_op_id: 'ordinary-1' }
    ]);
    const migrated = sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
    if (host === 'desktop') sqlite.transaction(() => migrateReviewLog(sqlite))();
    else await db.transaction(migrateCompanionReviewLog);
    expect(sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(migrated);
    expect(sqlite.prepare<[], { name: string }>('PRAGMA table_info(review_log)').all().map(row => row.name))
      .toEqual(['id', 'op_id', 'host_name', 'node_id', 'grade', 'scheduler_version', 'reviewed_at', 'kind', 'voids_op_id']);
    for (const id of ['ordinary', 'new', 'reset', 'normal']) {
      await applyReviewLogRecordsWithDbPort(db, [{ id: `next-${id}`, op_id: `next-${id}`, host_name: 'next',
        node_id: id, grade: 3, scheduler_version: 'current', reviewed_at: '2026-10-25T08:00:00.000Z',
        kind: 'review', voids_op_id: null }]);
    }
    expect(sqlite.prepare('SELECT node_id, reps FROM node_review ORDER BY node_id').all()).toEqual([
      { node_id: 'new', reps: 2 }, { node_id: 'normal', reps: 3 },
      { node_id: 'ordinary', reps: 2 }, { node_id: 'reset', reps: 1 }
    ]);
  } finally { sqlite.close(); }
});

it('generates identical deterministic repair facts on independently migrated desktop and companion databases', async () => {
  const a = await fixture('desktop'); const b = await fixture('companion');
  try {
    a.sqlite.transaction(() => migrateReviewLog(a.sqlite))();
    await b.db.transaction(migrateCompanionReviewLog);
    expect(a.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all())
      .toEqual(b.sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all());
  } finally { a.sqlite.close(); b.sqlite.close(); }
});

it.each(['desktop', 'companion'])('rolls back %s repairs and column removal on interrupted upgrade', async host => {
  const { sqlite, db } = await fixture(host);
  try {
    const original = sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all();
    const interrupted = async () => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } });
      else await db.transaction(tx => migrateCompanionDatabase(tx, 98, 99, () => { throw new Error('interrupted'); }));
    };
    await expect(interrupted()).rejects.toThrow('interrupted');
    expect(sqlite.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(original);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await db.transaction(tx => migrateCompanionDatabase(tx, 98, 99));
    expect(sqlite.prepare('SELECT COUNT(*) FROM review_log').pluck().get()).toBe(10);
  } finally { sqlite.close(); }
});


it('preserves existing mobile undo stacks and links their exact scoring operation before dropping state columns', async () => {
  const { sqlite, db } = await fixture('companion');
  try {
    const entry = { type: 'review.grade', id: 'legacy-history-id', nodeId: 'ordinary',
      beforeReview: { due: 'same-before', stability: 1, difficulty: 2 },
      afterReview: { due: 'second-after', stability: 5, difficulty: 6, lastReviewAt: '2026-05-20T08:00:02.000Z' },
      title: 'Grade Review', privateContext: { kept: true } };
    sqlite.prepare("INSERT INTO companion_meta VALUES ('flow_history:legacy', ?, 'now')")
      .run(JSON.stringify({ undoStack: [entry], redoStack: [] }));
    await db.transaction(tx => migrateCompanionDatabase(tx, 98, 99));
    expect(JSON.parse(String(sqlite.prepare("SELECT value FROM companion_meta WHERE key='flow_history:legacy'").pluck().get())))
      .toEqual({ undoStack: [{ ...entry, reviewOpId: 'ordinary-2' }], redoStack: [] });
  } finally { sqlite.close(); }
});
