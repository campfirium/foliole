import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import type { DatabaseDriver, DatabaseRow } from '../database/driver.js';
import { companionPort } from '../database/fsrs7Migration.testSupport.js';
import { saveNodeReadingStateWithSync, type NodeReadingSyncPayload } from '../database/nodeReadingSyncState.js';
import { nextReadingOrderAt, nextReadingOrderAtWithDb } from '../review/readingHistoryOrder.js';

import { applySyncObjectInTransaction } from './syncObjectApplyExecutor.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from './syncObjectPayloadSql.js';

type ReadingRecord = Parameters<typeof applySyncObjectInTransaction>[1];

const T0 = '2026-11-25T10:00:00.000Z';
const base: NodeReadingSyncPayload = { intervalDurationMs: 86_400_000, intervalGrowthFactor: 2, lastHandledAt: T0,
  nextAt: '2026-11-26T10:00:00.000Z', priority: 50, readingPosition: 0, repetitionCount: 4, state: 'active' };

function syncDriver(sqlite: DatabaseSync): DatabaseDriver {
  const statement = (sql: string) => {
    const prepared = sqlite.prepare(sql);
    return { sql,
      run: (params: readonly unknown[] = []) => {
        const result = prepared.run(...params as SQLInputValue[]);
        return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
      },
      get: <T extends DatabaseRow>(params: readonly unknown[] = []) => prepared.get(...params as SQLInputValue[]) as T | undefined,
      all: <T extends DatabaseRow>(params: readonly unknown[] = []) => prepared.all(...params as SQLInputValue[]) as T[] };
  };
  const driver: DatabaseDriver = {
    prepare: statement,
    execute: (sql, params) => statement(sql).run(params),
    queryOne: (sql, params) => statement(sql).get(params),
    queryAll: (sql, params) => statement(sql).all(params),
    transaction: (execute) => {
      sqlite.exec('BEGIN');
      try {
        const result = execute(driver);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return driver;
}

function library() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE node_reading (node_id TEXT PRIMARY KEY, interval_duration_ms INTEGER NOT NULL DEFAULT 0,
      interval_growth_factor REAL NOT NULL DEFAULT 1, last_handled_at TEXT NOT NULL, next_at TEXT NOT NULL,
      priority REAL NOT NULL DEFAULT 0, repetition_count INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active',
      history_order_at TEXT);
    CREATE TABLE node_reading_host_state (node_id TEXT, host_name TEXT, reading_position INTEGER, updated_at TEXT,
      PRIMARY KEY (node_id, host_name));
    CREATE TABLE node_sync_tombstones (node_id TEXT PRIMARY KEY);
    CREATE TABLE sync_state_sequence (singleton_id INTEGER PRIMARY KEY, high_water INTEGER NOT NULL);
    INSERT INTO sync_state_sequence VALUES (1, 0);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, current_version_id TEXT,
      content_hash TEXT, base_content_hash TEXT, last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT,
      sync_dirty INTEGER, PRIMARY KEY (object_type, object_id));`);
  const driver = syncDriver(sqlite);
  const port = companionPort(sqlite);
  return {
    port,
    write(reading: NodeReadingSyncPayload | null, now: string, historyOrder = false) {
      saveNodeReadingStateWithSync(driver, { nodeId: 'n', hostName: 'host', reading, updatedAt: now,
        ...(historyOrder ? { historyOrder } : {}) });
      return this.record();
    },
    record(): ReadingRecord {
      const state = sqlite.prepare(`SELECT content_hash, updated_at, deleted_at FROM sync_object_state
        WHERE object_type = 'node_reading' AND object_id = 'n'`).get() as { content_hash: string; deleted_at: string | null; updated_at: string };
      const row = sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.node_reading).get('n') as { payload_json: string } | undefined;
      return { object_type: 'node_reading', object_id: 'n', content_hash: state.content_hash, deleted_at: state.deleted_at,
        updated_at: state.updated_at, payload_json: state.deleted_at ? null : row!.payload_json };
    },
    async receive(record: ReadingRecord) {
      await port.transaction(tx => applySyncObjectInTransaction(tx, record));
    },
    snapshot() {
      return { reading: sqlite.prepare(`SELECT last_handled_at, next_at, repetition_count, state, history_order_at
        FROM node_reading WHERE node_id = 'n'`).get() ?? null,
      state: sqlite.prepare(`SELECT content_hash, updated_at, deleted_at FROM sync_object_state
        WHERE object_type = 'node_reading' AND object_id = 'n'`).get() };
    }
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)])
    .map(rest => [item, ...rest]));
}

const minutes = (count: number) => new Date(Date.parse(T0) + count * 60_000).toISOString();

/** Three devices share the starting reading, then act without seeing each other; the slow device runs an hour behind. */
async function concurrentRecords(options: { reset: boolean }) {
  const desktop = library();
  const original = desktop.write(base, T0);
  const slow = library();
  const other = library();
  const resetting = library();
  for (const peer of [slow, other, resetting]) await peer.receive(original);
  const read = slow.write({ ...base, lastHandledAt: minutes(-55), repetitionCount: 5, state: 'dismissed' }, minutes(-55));
  const undo = slow.write(base, minutes(-54), true);
  const postpone = other.write({ ...base, nextAt: '2026-11-30T10:00:00.000Z' }, minutes(10));
  const records = { read, undo, postpone, ...(options.reset ? { reset: resetting.write(null, minutes(8)) } : {}) };
  return { original, records };
}

async function convergeOverAllOrders(original: ReadingRecord, records: ReadingRecord[]) {
  const outcomes = new Set<string>();
  let last: ReturnType<ReturnType<typeof library>['snapshot']> | undefined;
  for (const order of permutations(records)) {
    const peer = library();
    await peer.receive(original);
    for (const record of order) await peer.receive(record);
    last = peer.snapshot();
    outcomes.add(JSON.stringify(last));
  }
  return { outcomes, last: last! };
}

describe('reading records converge whatever order they arrive in', () => {
  it('accepts an undo from a slow clock and keeps it over the reading it reversed and a concurrent postpone', async () => {
    const { original, records } = await concurrentRecords({ reset: false });
    const { outcomes, last } = await convergeOverAllOrders(original, Object.values(records));
    expect(outcomes.size).toBe(1);
    expect(last.reading).toMatchObject({ last_handled_at: T0, repetition_count: 4, state: 'active',
      next_at: base.nextAt, history_order_at: records.undo.updated_at });
  });

  it('lets a later reset win over the undo and the postpone in every order', async () => {
    const { original, records } = await concurrentRecords({ reset: true });
    const { outcomes, last } = await convergeOverAllOrders(original, Object.values(records));
    expect(outcomes.size).toBe(1);
    expect(last.reading).toBeNull();
    expect(last.state).toMatchObject({ deleted_at: records.reset!.updated_at });
  });

  it('keeps a reading made after the reset over the reset whatever arrives first', async () => {
    const desktop = library();
    const original = desktop.write(base, T0);
    const reset = desktop.write(null, minutes(5));
    // The device that reset the reading starts it again with a clock an hour behind.
    const restart = desktop.write({ ...base, lastHandledAt: minutes(-50), repetitionCount: 0 }, minutes(-50));
    const { outcomes, last } = await convergeOverAllOrders(original, [reset, restart]);
    expect(outcomes.size).toBe(1);
    expect(last.reading).toMatchObject({ repetition_count: 0 });
  });
});

describe('next reading order', () => {
  const current = { orderAt: T0, lastHandledAt: T0 };

  it('stamps acts after the current record even when the clock runs behind', () => {
    expect(nextReadingOrderAt({ current, next: { lastHandledAt: minutes(-30) }, now: minutes(-30), restore: true }))
      .toBe('2026-11-25T10:00:00.001Z');
    expect(nextReadingOrderAt({ current, next: null, now: minutes(-30) })).toBe('2026-11-25T10:00:00.001Z');
    expect(nextReadingOrderAt({ current, next: { lastHandledAt: minutes(5) }, now: minutes(5) })).toBe(minutes(5));
  });

  it('stamps edits one step after the current record so they never beat a concurrent act', () => {
    expect(nextReadingOrderAt({ current, next: { lastHandledAt: T0 }, now: minutes(30) })).toBe('2026-11-25T10:00:00.001Z');
  });

  it('treats a first reading or one after a deletion as an act', () => {
    expect(nextReadingOrderAt({ current: { orderAt: null, lastHandledAt: null }, next: { lastHandledAt: T0 }, now: minutes(1) }))
      .toBe(minutes(1));
    expect(nextReadingOrderAt({ current: { orderAt: minutes(5), lastHandledAt: null }, next: { lastHandledAt: T0 }, now: minutes(1) }))
      .toBe('2026-11-25T10:05:00.001Z');
  });

  it('keeps the record when only the local reading position changes', () => {
    const peer = library();
    const first = peer.write(base, T0);
    expect(peer.write({ ...base, readingPosition: 42 }, minutes(30))).toEqual(first);
  });

  it('reads the current order from an async library', async () => {
    const peer = library();
    peer.write(base, T0);
    await expect(nextReadingOrderAtWithDb(peer.port, { nodeId: 'n', next: null, now: minutes(-10) }))
      .resolves.toBe('2026-11-25T10:00:00.001Z');
  });
});
