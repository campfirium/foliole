// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, exchange, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it('does not publish or install a daily list when the peer has not started its own day', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'topic');
  await exchange(a, b);
  const source = await open(a);
  const rows = await readCycleRows(a.port);
  await exchange(a, b);
  expect(await readDailyFlow(b.port)).toBeNull();
  expect(await readCycleRows(b.port)).toEqual([]);
  expect(await readCycleRows(a.port)).toEqual(rows);
  expect((await readDailyFlow(a.port))!.session).toEqual(source);
  expect(b.db.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind='create'").all()).toEqual([]);
  const local = await open(b);
  expect(local.daily!.scope).not.toBe(source.daily!.scope);
  expect(b.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get())
    .not.toEqual(a.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get());
});

it('synchronizes learning operations without replacing either existing local list or cursor', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  await exchange(a, b);
  const source = await open(a);
  const local = await open(b);
  const root = b.db.prepare('SELECT root_id,head_id FROM daily_flow_sync_projection').get();
  const rows = await readCycleRows(b.port);
  await act(a, source, 'grade', '2026-10-26T08:01:00.000Z');
  await exchange(a, b);
  const received = await readDailyFlow(b.port);
  expect(received!.session.currentNodeId).toBe(local.currentNodeId);
  expect(b.db.prepare('SELECT root_id,head_id FROM daily_flow_sync_projection').get()).toEqual(root);
  expect(await readCycleRows(b.port)).toEqual(rows);
  expect((await snapshot(b)).nodesById[source.currentNodeId!]!.review)
    .toEqual((await snapshot(a)).nodesById[source.currentNodeId!]!.review);
  const receivedFacts = b.db.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind!='create' ORDER BY id").all();
  expect(receivedFacts).toEqual(a.db.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind!='create' ORDER BY id").all());
  expect(receivedFacts).toHaveLength(1);
  await exchange(a, b);
  expect(b.db.prepare("SELECT id FROM daily_flow_sync_facts WHERE kind!='create' ORDER BY id").all()).toEqual(receivedFacts);
  expect((await readDailyFlow(b.port))!.session.currentNodeId).toBe(local.currentNodeId);
});

it('keeps a receiving device without a local list while importing a completed Read', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b']) node(a, id, 'topic');
  await exchange(a, b);
  const source = await open(a);
  await act(a, source, 'read', now);
  await exchange(a, b);
  expect(await readDailyFlow(b.port)).toBeNull();
  expect((await snapshot(b)).nodesById[source.currentNodeId!]!.reading)
    .toEqual((await snapshot(a)).nodesById[source.currentNodeId!]!.reading);
  const first = await open(b);
  expect(first.currentNodeId).not.toBe(source.currentNodeId);
});

it('refreshes changed material after an old merge without replaying roots or rewriting the list', async () => {
  const [a] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'topic');
  const session = await open(a);
  await act(a, session, 'soon', now);
  const before = await readCycleRows(a.port);
  a.db.prepare('UPDATE daily_flow_sync_projection SET merged=1').run();
  a.db.prepare("UPDATE nodes SET title='Updated title' WHERE id='b'").run();
  expect((await readDailyFlow(a.port))!.invalidated).toBe(1);
  const queries: string[] = [];
  const observe = (db: typeof a.port): typeof a.port => ({ ...db,
    query: async (sql, params) => { queries.push(sql); return db.query(sql, params); },
    run: async (sql, params) => { queries.push(sql); return db.run(sql, params); },
    transaction: task => db.transaction(tx => task(observe(tx))) });
  const result = await openDailyFlow(observe(a.port), { now, mode: 'recommended' }, settings(a), persistence);
  expect(result.session.readTopicCount).toBe(1);
  expect(await readCycleRows(a.port)).toEqual(before);
  expect(queries.filter(sql => /FROM daily_flow_fact_rows|DELETE FROM daily_flow_entries|INSERT INTO daily_flow_entries/.test(sql))).toEqual([]);
});
