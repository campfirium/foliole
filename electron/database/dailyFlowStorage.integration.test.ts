// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DAILY_FLOW_CURRENT_SCHEMA } from '../../lib/core/database/dailyFlowSchema.js';
import { changeCycleHash } from '../../lib/core/flow/cycleFlowFingerprint.js';
import { EMPTY_CYCLE_HASH, type CycleRow } from '../../lib/core/flow/cycleFlowTypes.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { readDailyFlow, readCycleRows, saveCycleFlow, writeCycleRows } from '../../lib/core/flow/dailyFlowStorage.js';
import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('persists a large cycle, changes only affected rows and reads a bounded receipt after reopening', async () => {
  fs.mkdirSync('.tmp/artifacts/T441', { recursive: true });
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/T441/storage-'));
  const file = path.join(root, 'cycle.sqlite');
  let sqlite = new Database(file);
  try {
    sqlite.exec(DAILY_FLOW_CURRENT_SCHEMA.slice(0, 4).join(';'));
    let db = createBetterSqliteDbPort(sqlite);
    const rows: CycleRow[] = Array.from({ length: 3000 }, (_, index) => ({ node_id: `topic-${index}`,
      order_key: index + 1, active: 1, cohort: 'queue', initial_task: 1, handled: 0 }));
    const session: DailyFlowSession = { currentNodeId: rows[0]!.node_id, queueNodeIds: rows.slice(0, 2).map(row => row.node_id),
      totalNodeCount: rows.length, isAnswerRevealed: false, flowFormat: 'cycle-v1', cycle: {
        clearKey: rows.length, clearedAt: null, scanAfter: 1, lapLimit: rows.length, tailKey: rows.length,
        rowsHash: changeCycleHash(EMPTY_CYCLE_HASH, [], rows), stamp: '', remaining: rows.length, reviewRemaining: 0 } };
    await db.transaction(tx => writeCycleRows(tx, rows));
    const args = { dayKey: '2026-10-27', mode: 'recommended', settingsKey: '{"scope":"large"}',
      now: '2026-10-27T00:00:00.000Z', revision: 1, session };
    const saved = await db.transaction(tx => saveCycleFlow(tx, args));
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    const query = db.query.bind(db);
    let largestResponse = 0;
    db.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
      const result = await query<T>(sql, params);
      largestResponse = Math.max(largestResponse, Buffer.byteLength(JSON.stringify(result)));
      return result;
    };
    expect((await readDailyFlow(db))!.session).toEqual(saved);
    expect(largestResponse).toBeLessThan(4096);
    const first = rows[0]!;
    await db.transaction(tx => writeCycleRows(tx, [{ ...first, order_key: 3001, cohort: 'soon', initial_task: 0, handled: 1 }]));
    expect((await readCycleRows(db)).filter(row => row.node_id !== first.node_id)).toEqual(rows.slice(1));
    expect((await readCycleRows(db, [first.node_id]))[0]).toMatchObject({ order_key: 3001, cohort: 'soon' });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM daily_flow_entries').get()).toEqual({ n: 3000 });
    sqlite.close();
    sqlite = new Database(file);
    db = createBetterSqliteDbPort(sqlite);
    expect((await readDailyFlow(db))!.session).toEqual(saved);
    expect(await readCycleRows(db)).toEqual([...rows.slice(1),
      { ...first, order_key: 3001, cohort: 'soon', initial_task: 0, handled: 1 }]);
  } finally {
    sqlite.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('atomically replaces reordered rows and restores the full list when a batch violates uniqueness', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(DAILY_FLOW_CURRENT_SCHEMA.slice(0, 4).join(';'));
    const db = createBetterSqliteDbPort(sqlite);
    const initial: CycleRow[] = [
      { node_id: '资料-😀-"quoted"', order_key: 1, active: 1, cohort: 'queue', initial_task: 1, handled: 0 },
      { node_id: 'second', order_key: 2, active: 1, cohort: 'soon', initial_task: 0, handled: 1 },
      { node_id: 'untouched', order_key: 3, active: 0, cohort: 'none', initial_task: 0, handled: 0 }
    ];
    await db.transaction(tx => writeCycleRows(tx, initial));
    await db.transaction(tx => writeCycleRows(tx, []));
    expect(await readCycleRows(db)).toEqual(initial);
    const swapped: CycleRow[] = [
      { ...initial[0]!, order_key: 2, active: 0, cohort: 'none', initial_task: 0, handled: 1 },
      { ...initial[1]!, order_key: 1, active: 1, cohort: 'queue', initial_task: 1, handled: 0 }
    ];
    await db.transaction(tx => writeCycleRows(tx, swapped));
    const expected = [swapped[1]!, swapped[0]!, initial[2]!];
    expect(await readCycleRows(db)).toEqual(expected);
    // The first statement deletes rows; a rejected insert must restore those rows too.
    await expect(db.transaction(tx => writeCycleRows(tx,
      [{ ...swapped[0]!, order_key: 3 }, swapped[1]!]))).rejects.toThrow();
    expect(await readCycleRows(db)).toEqual(expected);
    await expect(db.transaction(tx => writeCycleRows(tx,
      [swapped[0]!, { ...swapped[0]!, order_key: 4 }]))).rejects.toThrow();
    expect(await readCycleRows(db)).toEqual(expected);
    await db.transaction(tx => writeCycleRows(tx, initial.slice(0, 2)));
    expect(await readCycleRows(db)).toEqual(initial);
  } finally { sqlite.close(); }
});
