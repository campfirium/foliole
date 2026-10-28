// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { createSqliteDailyFlowStore } from '../../lib/core/flow/dailyFlowSqliteStore.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-27T08:00:00.000Z';
const tomorrow = '2026-10-28T08:00:00.000Z';
const unsupported = async (): Promise<never> => { throw new Error('Unexpected learning write'); };
const persistence: DailyFlowPersistence = {
  learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
  snapshot: unsupported, grade: unsupported, reading: unsupported, reviewHistory: unsupported
};
const settings = { scope: 'rollover', newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue };

afterEach(closeLibraries);

async function fixture(mode: 'recommended' | 'review-first' | 'reading-only' = 'recommended') {
  await startLibraries();
  const peer = createPeer('desktop');
  for (const id of ['a', 'b', 'c']) peer.db.prepare(`INSERT INTO nodes
    (id, kind, title, content, created_at, updated_at, is_title_manual)
    VALUES (?, 'topic', ?, 'Complete body', ?, ?, 1)`).run(id, id, now, now);
  await openDailyFlow(peer.port, { now, mode }, settings, persistence);
  peer.db.prepare(`INSERT INTO daily_flow_operations
    (op_id,input_hash,revision,card_json,source_session_json) VALUES ('old','hash',1,NULL,NULL)`).run();
  return peer;
}

function observed(port: DbPort, statements: string[], failState = false): DbPort {
  return { ...port, transaction: execute => port.transaction(tx => execute({ ...tx, async run(sql, params) {
    statements.push(sql);
    if (failState && sql.startsWith('INSERT INTO daily_flow_state')) throw new Error('state save rejected');
    return tx.run(sql, params);
  } })) };
}

function readIndependent(peer: Peer) {
  const reader = new Database(peer.file, { readonly: true });
  try {
    return { rows: reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all(),
      state: reader.prepare('SELECT * FROM daily_flow_state').all(),
      operations: reader.prepare('SELECT * FROM daily_flow_operations').all() };
  } finally { reader.close(); }
}

it.each(['recommended', 'review-first', 'reading-only'] as const)(
  'rebuilds the complete next day in %s after one clear without another member deletion', async mode => {
    const peer = await fixture(mode);
    const previousDay = (await readDailyFlow(peer.port))!.day_key;
    const expected = await readCycleRows(peer.port);
    const facts = peer.db.prepare('SELECT * FROM nodes ORDER BY id').all();
    const statements: string[] = [];
    const result = await openDailyFlow(observed(peer.port, statements),
      { now: tomorrow, mode }, settings, persistence);
    const stored = readIndependent(peer);
    expect(stored.rows).toEqual(expected);
    expect(stored.operations).toEqual([]);
    expect((await readDailyFlow(peer.port))?.session).toEqual(result.session);
    expect(result.session.daily?.dayKey).not.toBe(previousDay);
    expect(peer.db.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(facts);
    expect(statements.filter(sql => sql.startsWith('DELETE FROM daily_flow_entries')))
      .toEqual(['DELETE FROM daily_flow_entries']);
    expect(statements.filter(sql => sql.startsWith('INSERT INTO daily_flow_entries'))).toHaveLength(1);
    const reopened = await openDailyFlow(peer.port, { now: tomorrow, mode }, settings, persistence);
    expect(reopened.session).toEqual(result.session);
    expect(readIndependent(peer)).toEqual(stored);
});

it('rolls back the daily clear and all inserted rows when saving the next day fails', async () => {
  const peer = await fixture();
  const before = readIndependent(peer);
  await expect(openDailyFlow(observed(peer.port, [], true),
    { now: tomorrow, mode: 'recommended' }, settings, persistence)).rejects.toThrow('state save rejected');
  expect(readIndependent(peer)).toEqual(before);
  await openDailyFlow(peer.port, { now: tomorrow, mode: 'recommended' }, settings, persistence);
  expect(readIndependent(peer).operations).toEqual([]);
  expect(await readCycleRows(peer.port)).toEqual(before.rows);
});

it('keeps replacement semantics for later batches after a reset and first insertion', async () => {
  const peer = await fixture();
  const rows = await readCycleRows(peer.port);
  await peer.port.transaction(async tx => {
    const store = createSqliteDailyFlowStore(tx, persistence);
    await store.resetCycle();
    await store.writeRows(rows);
    await store.writeRows([{ ...rows[0]!, order_key: rows[1]!.order_key },
      { ...rows[1]!, order_key: rows[0]!.order_key }]);
  });
  expect(await readCycleRows(peer.port)).toEqual([
    { ...rows[1]!, order_key: rows[0]!.order_key }, { ...rows[0]!, order_key: rows[1]!.order_key }, rows[2]!]);
});

it('keeps replacing matching rows when state is absent without assuming entries are empty', async () => {
  const peer = await fixture();
  const rows = await readCycleRows(peer.port);
  peer.db.prepare('DELETE FROM daily_flow_state').run();
  await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings, persistence);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  expect(peer.db.prepare('SELECT op_id FROM daily_flow_operations').all()).toEqual([{ op_id: 'old' }]);
});

it('commits an empty next day without retaining old rows or operations', async () => {
  const peer = await fixture();
  peer.db.prepare('UPDATE nodes SET shelved_at = ?').run(now);
  const result = await openDailyFlow(peer.port, { now: tomorrow, mode: 'recommended' }, settings, persistence);
  expect(result.session.currentNodeId).toBeNull();
  expect(result.session.cycle?.remaining).toBe(0);
  const stored = readIndependent(peer);
  expect(stored.rows).toEqual([]);
  expect(stored.operations).toEqual([]);
  expect((await readDailyFlow(peer.port))?.session).toEqual(result.session);
});
