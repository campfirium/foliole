// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createSqliteDailyFlowStore } from '../../lib/core/flow/dailyFlowSqliteStore.js';
import { readDailyFlow, writeCycleRows } from '../../lib/core/flow/dailyFlowStorage.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { emptyChecks, entryDeletes, fixture, observe, open, persistence, readIndependent, row, type Call } from './dailyFlowEmptyGeneration.testSupport.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);

it('commits all 14241 UUID rows without sending a member deletion for a truly empty first list', async () => {
  const peer = await fixture(14241);
  const facts = readIndependent(peer).facts;
  const calls: Call[] = [];
  const result = await open(observe(peer.port, calls));
  const expected = (peer.db.prepare('SELECT id FROM nodes ORDER BY id').all() as { id: string }[])
    .map(({ id }, index) => row(id, index + 1));
  const stored = readIndependent(peer);
  expect(stored.rows).toEqual(expected);
  expect(stored.facts.slice(0, 3)).toEqual(facts.slice(0, 3));
  expect((await readDailyFlow(peer.port))?.session).toEqual(result.session);
  expect(result.session.cycle).toMatchObject({ remaining: 14241, tailKey: 14241, clearKey: 14241 });
  expect(entryDeletes(calls)).toHaveLength(0);
  expect(emptyChecks(calls)).toHaveLength(1);
  const reopenCalls: Call[] = [];
  expect((await open(observe(peer.port, reopenCalls))).session).toEqual(result.session);
  expect(readIndependent(peer)).toEqual(stored);
  expect(entryDeletes(reopenCalls)).toEqual([]);
  expect(emptyChecks(reopenCalls)).toEqual([]);
});

it('replaces leftover matching IDs while preserving unrelated rows and operations without a state row', async () => {
  const peer = await fixture();
  const ids = peer.db.prepare('SELECT id FROM nodes ORDER BY id').all() as { id: string }[];
  const leftover = { ...row('unrelated', 99), active: 0 as const, handled: 1 as const, cohort: 'none' as const };
  await peer.port.transaction(tx => writeCycleRows(tx, [{ ...row(ids[0]!.id, 2), handled: 1 }, row(ids[1]!.id, 1), leftover]));
  peer.db.exec("INSERT INTO daily_flow_operations VALUES ('old','hash',1,NULL,NULL)");
  const before = readIndependent(peer);
  const calls: Call[] = [];
  await open(observe(peer.port, calls));
  const stored = readIndependent(peer);
  expect(stored.rows).toEqual([row(ids[0]!.id, 1), row(ids[1]!.id, 2), leftover]);
  expect(stored.operations).toEqual(before.operations);
  expect(stored.facts.slice(0, 3)).toEqual(before.facts.slice(0, 3));
  expect(entryDeletes(calls)).toHaveLength(1);
});

it('rejects an unrelated order collision and restores every existing fact', async () => {
  const peer = await fixture();
  await peer.port.transaction(tx => writeCycleRows(tx, [row('unrelated', 1)]));
  const before = readIndependent(peer);
  await expect(open(peer.port)).rejects.toThrow('UNIQUE');
  expect(readIndependent(peer)).toEqual(before);
});

it('does not reuse the first empty proof for later replacement batches in the same transaction', async () => {
  const peer = await fixture(0);
  const calls: Call[] = [];
  await observe(peer.port, calls).transaction(async tx => {
    const store = createSqliteDailyFlowStore(tx, persistence);
    expect(await store.readState()).toBeNull();
    await store.writeRows([row('a', 1), row('b', 2)]);
    await store.writeRows([{ ...row('a', 2), active: 0, cohort: 'none', handled: 1 }, row('b', 1)]);
  });
  expect(readIndependent(peer).rows).toEqual([
    row('b', 1), { ...row('a', 2), active: 0, cohort: 'none', handled: 1 }
  ]);
  expect(emptyChecks(calls)).toHaveLength(1);
  expect(entryDeletes(calls)).toHaveLength(1);
});

it.each([false, true])('commits zero candidates without deleting leftovers (%s)', async leftovers => {
  const peer = await fixture(0);
  if (leftovers) await peer.port.transaction(tx => writeCycleRows(tx, [row('unrelated', 1)]));
  const before = readIndependent(peer);
  const calls: Call[] = [];
  const result = await open(observe(peer.port, calls));
  expect(result.session.currentNodeId).toBeNull();
  expect(result.session.cycle?.remaining).toBe(0);
  expect(readIndependent(peer).rows).toEqual(before.rows);
  expect(entryDeletes(calls)).toEqual([]);
  expect(emptyChecks(calls)).toEqual([]);
});

it.each(['state', 'commit'])('rolls back first insertion when %s fails and safely retries', async failure => {
  const peer = await fixture();
  if (failure === 'state') peer.db.exec(`CREATE TEMP TRIGGER reject_state BEFORE INSERT ON daily_flow_state
    BEGIN SELECT RAISE(ABORT, 'state rejected'); END`);
  else peer.db.exec(`CREATE TABLE commit_parent (id INTEGER PRIMARY KEY);
    CREATE TABLE commit_child (id INTEGER REFERENCES commit_parent(id) DEFERRABLE INITIALLY DEFERRED);
    CREATE TEMP TRIGGER reject_commit AFTER INSERT ON daily_flow_state
      BEGIN INSERT INTO commit_child VALUES (1); END`);
  const before = readIndependent(peer);
  await expect(open(peer.port)).rejects.toThrow(failure === 'state' ? 'state rejected' : 'FOREIGN KEY');
  expect(peer.db.inTransaction).toBe(false);
  expect(readIndependent(peer)).toEqual(before);
  peer.db.exec(`DROP TRIGGER reject_${failure}`);
  await open(peer.port);
  expect(readIndependent(peer).rows).toHaveLength(2);
});

it('holds the writer boundary between proving emptiness and insertion across independent first opens', async () => {
  const peer = await fixture();
  const other = new Database(peer.file, { timeout: 0 });
  const contender = createBetterSqliteDbPort(other);
  let sawCheck = false;
  try {
    const result = await open(observe(peer.port, [], async sql => {
      if (sql !== 'SELECT 1 FROM daily_flow_entries LIMIT 1') return;
      sawCheck = true;
      expect(peer.db.inTransaction).toBe(true);
      expect(await contender.query('SELECT * FROM daily_flow_entries')).toEqual([]);
      await expect(open(contender)).rejects.toThrow('locked');
    }));
    expect(sawCheck).toBe(true);
    const stored = readIndependent(peer);
    expect((await open(contender)).session).toEqual(result.session);
    expect(await contender.query('SELECT * FROM daily_flow_entries ORDER BY order_key')).toEqual(stored.rows);
    expect(readIndependent(peer)).toEqual(stored);
  } finally { other.close(); }
});
