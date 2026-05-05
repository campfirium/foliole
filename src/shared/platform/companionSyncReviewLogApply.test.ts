import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeSyncReviewLogRecord } from '../../../lib/platform/nativeSyncContract';

import {
  applyCompanionSyncReviewLogWithSharedCore,
  applyCompanionSyncReviewLogWithSharedCoreOnDevice
} from './companionSyncReviewLogApply';

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

it('applies review log through the Capacitor DbPort adapter and shared core', async () => {
  db = new Database(':memory:');
  installReviewLogSchema(db);

  await expect(applyCompanionSyncReviewLogWithSharedCore(createFakeCapacitorConnection(db) as never, [
    reviewLogRecord()
  ])).resolves.toEqual(['review-op-1']);
  await expect(applyCompanionSyncReviewLogWithSharedCore(createFakeCapacitorConnection(db) as never, [
    reviewLogRecord()
  ])).resolves.toEqual([]);

  expect(db.prepare('SELECT op_id, node_id, grade FROM review_log').all() as unknown).toEqual([{
    grade: 3,
    node_id: 'node-1',
    op_id: 'review-op-1'
  }]);
});

it('opens the Android companion database before applying review log', async () => {
  db = new Database(':memory:');
  installReviewLogSchema(db);
  const connection = createFakeCapacitorConnection(db);
  const manager = {
    createConnection: vi.fn(async () => connection),
    isConnection: vi.fn(async () => ({ result: false })),
    retrieveConnection: vi.fn()
  };

  await expect(applyCompanionSyncReviewLogWithSharedCoreOnDevice([reviewLogRecord()], manager as never))
    .resolves.toEqual(['review-op-1']);

  expect(manager.createConnection).toHaveBeenCalledWith('foliole-companion', false, 'no-encryption', 14, false);
  expect(connection.open).toHaveBeenCalled();
});

function reviewLogRecord(): NativeSyncReviewLogRecord {
  return {
    difficulty_after: 3.6,
    difficulty_before: 3.2,
    device_id: 'desktop',
    due_after: '2026-05-08T01:00:00.000Z',
    due_before: '2026-05-05T01:00:00.000Z',
    grade: 3,
    id: 'review-id-1',
    node_id: 'node-1',
    op_id: 'review-op-1',
    reviewed_at: '2026-05-04T01:00:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 4.2,
    stability_before: 2.1
  };
}

function createFakeCapacitorConnection(database: Database.Database) {
  return {
    beginTransaction: async () => {
      database.exec('BEGIN');
    },
    commitTransaction: async () => {
      database.exec('COMMIT');
    },
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    open: vi.fn(async () => undefined),
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...params)
    }),
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...params);
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function installReviewLogSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY);
    INSERT INTO nodes (id) VALUES ('node-1');
    CREATE TABLE review_log (
      id TEXT PRIMARY KEY,
      op_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL DEFAULT '',
      node_id TEXT NOT NULL,
      grade INTEGER NOT NULL,
      scheduler_version TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      due_before TEXT,
      stability_before REAL,
      difficulty_before REAL,
      due_after TEXT,
      stability_after REAL,
      difficulty_after REAL
    );
  `);
}
