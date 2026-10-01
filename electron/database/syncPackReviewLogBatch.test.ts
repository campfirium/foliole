// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';
import { applySyncPackReviewLogWithDbPort } from '../../lib/core/sync/syncPackReviewLogExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function createReviewDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY);
    INSERT INTO nodes VALUES ('node-1');
    CREATE TABLE review_log (
      id TEXT, op_id TEXT UNIQUE, host_name TEXT, node_id TEXT, grade INTEGER,
      scheduler_version TEXT, reviewed_at TEXT, due_before TEXT,
      stability_before REAL, difficulty_before REAL, due_after TEXT,
      stability_after REAL, difficulty_after REAL
    );
    ATTACH DATABASE ':memory:' AS inc;
    CREATE TABLE inc.review_log AS SELECT * FROM main.review_log WHERE 0;
  `);
  const insert = db.prepare(`INSERT INTO inc.review_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAll = db.transaction(() => {
    for (let index = 0; index < 1200; index++) {
      const identity = String(index).padStart(4, '0');
      insert.run(`review-${identity}`, `op-${identity}`, 'source', 'node-1', 3,
        'fsrs', '2026-09-30T00:00:00.000Z', '2026-10-01T00:00:00.000Z',
        1, 2, '2026-10-02T00:00:00.000Z', 3, 4);
    }
  });
  insertAll();
  return db;
}

it('reads large review histories in bounded pages and persists every event across replay', async () => {
  const db = createReviewDatabase();
  try {
    const port = createBetterSqliteDbPort(db);
    const query = port.query.bind(port);
    const pageSizes: number[] = [];
    port.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await query<T>(sql, params);
      if (sql.includes('FROM inc.review_log') && sql.includes('SELECT id, op_id')) {
        expect(sql).toContain('LIMIT ?');
        pageSizes.push(rows.length);
      }
      return rows;
    };
    const first = await applySyncPackReviewLogWithDbPort(port);
    expect(first).toHaveLength(1200);
    expect(first[0]).toBe('op-0000');
    expect(first[1199]).toBe('op-1199');
    expect(pageSizes).toEqual([500, 500, 200]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 1200 });

    pageSizes.length = 0;
    expect(await applySyncPackReviewLogWithDbPort(port)).toEqual(first);
    expect(pageSizes).toEqual([500, 500, 200]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 1200 });
    db.prepare("UPDATE inc.review_log SET grade = 1 WHERE op_id = 'op-0250'").run();
    await expect(applySyncPackReviewLogWithDbPort(port)).rejects.toThrow('sync_review_log_op_mismatch:op-0250');
  } finally {
    db.close();
  }
});

it('caps decoded review bytes as well as row count without losing a large event', async () => {
  const db = createReviewDatabase();
  try {
    db.prepare('DELETE FROM inc.review_log').run();
    const insert = db.prepare(`INSERT INTO inc.review_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (let index = 0; index < 3; index++) {
      insert.run(`review-big-${index}`, `op-big-${index}`, 'x'.repeat(900 * 1024),
        'node-1', 3, 'fsrs', '2026-09-30T00:00:00.000Z',
        '2026-10-01T00:00:00.000Z', 1, 2, '2026-10-02T00:00:00.000Z', 3, 4);
    }
    const port = createBetterSqliteDbPort(db);
    const query = port.query.bind(port);
    const payloadSizes: number[] = [];
    port.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
      const rows = await query<T>(sql, params);
      if (sql.includes('FROM inc.review_log') && sql.includes('SELECT id, op_id')) {
        payloadSizes.push(rows.length);
      }
      return rows;
    };
    expect(await applySyncPackReviewLogWithDbPort(port)).toEqual([
      'op-big-0', 'op-big-1', 'op-big-2'
    ]);
    expect(payloadSizes).toEqual([2, 1]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 3 });
  } finally {
    db.close();
  }
});

it('rolls back earlier batches when a later review identity conflicts', async () => {
  const db = createReviewDatabase();
  try {
    db.exec(`INSERT INTO main.review_log SELECT * FROM inc.review_log WHERE op_id = 'op-0750';
      UPDATE main.review_log SET grade = 1 WHERE op_id = 'op-0750';`);
    await expect(applySyncPackReviewLogWithDbPort(createBetterSqliteDbPort(db)))
      .rejects.toThrow('sync_review_log_op_mismatch:op-0750');
    expect(db.prepare('SELECT COUNT(*) AS count FROM review_log').get()).toEqual({ count: 1 });
  } finally {
    db.close();
  }
});
