// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, exchange, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport';

const first = '2026-10-26T08:01:00.000Z';
const second = '2026-10-26T08:02:00.000Z';
afterEach(closeLibraries);

async function peers(kind: 'item' | 'topic' = 'topic') {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd']) node(a, id, kind);
  await exchange(a, b);
  await openDailyFlow(a.port, { now, mode: 'recommended', preferredNodeId: 'a' }, settings(a), persistence);
  await openDailyFlow(b.port, { now, mode: 'recommended', preferredNodeId: 'c' }, settings(b), persistence);
  return [a, b] as const;
}

function identity(peer: Peer) { return peer.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get(); }

it('applies peer Soon locally once without adopting its cursor or moving unrelated members', async () => {
  const [a, b] = await peers();
  const root = identity(b);
  const before = await readCycleRows(b.port);
  await act(a, await open(a), 'soon', first);
  await exchange(a, b);
  expect((await readDailyFlow(b.port))!.session.currentNodeId).toBe('c');
  const restored = await open(b, second);
  expect(restored.currentNodeId).toBe('c');
  expect(restored.readTopicCount).toBe(1);
  const rows = await readCycleRows(b.port);
  expect(rows.filter(row => row.node_id !== 'a')).toEqual(before.filter(row => row.node_id !== 'a'));
  expect(rows.at(-1)).toMatchObject({ node_id: 'a', cohort: 'soon', handled: 1, initial_task: 0 });
  expect(identity(b)).toEqual(root);
  await exchange(b, a);
  expect((await open(b, second)).readTopicCount).toBe(1);
  expect(await readCycleRows(b.port)).toEqual(rows);
  const reader = new Database(b.file, { readonly: true });
  try { expect(reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows); }
  finally { reader.close(); }
});

it('keeps both real ratings while counting their shared item once and adding elapsed contributions', async () => {
  const [a, b] = await peers('item');
  const local = await openDailyFlow(b.port, { now, mode: 'recommended', preferredNodeId: 'a' }, settings(b), persistence);
  await act(a, await open(a), 'grade', first);
  await act(b, local.session, 'grade', second);
  await exchange(a, b);
  for (const peer of [a, b]) {
    const result = await open(peer, second);
    expect(result.reviewedItemCount).toBe(1);
    expect(result.reviewElapsedMs).toBe(180_000);
    expect(peer.db.prepare('SELECT COUNT(*) FROM review_log').pluck().get()).toBe(2);
  }
  expect(identity(a)).not.toEqual(identity(b));
});

it('undoes and redoes a shared Soon using each local queue rather than source positions', async () => {
  const [a, b] = await peers();
  const before = await readCycleRows(b.port);
  const entry = await historyEntry(a, 'a', 'soon', first);
  await exchange(a, b);
  await open(b, second);
  expect((await readCycleRows(b.port, ['a']))[0]).toMatchObject({ cohort: 'soon', initial_task: 0 });
  const undone = await replayHistory(a, await open(a, second), entry, 'undo', second);
  await exchange(a, b);
  const received = await open(b, second);
  expect(received.currentNodeId).toBe('c');
  expect(received.readTopicCount).toBe(0);
  expect(await readCycleRows(b.port)).toEqual(before);
  await replayHistory(a, undone.session, entry, 'redo', '2026-10-26T08:03:00.000Z');
  await exchange(a, b);
  expect((await open(b, '2026-10-26T08:03:00.000Z')).readTopicCount).toBe(1);
  expect((await readCycleRows(b.port, ['a']))[0]).toMatchObject({ cohort: 'soon', initial_task: 0 });
});

it('retains another device reading when undoing only the selected earlier Read', async () => {
  const [a, b] = await peers();
  const entry = await historyEntry(a, 'a', 'read', first);
  const local = await openDailyFlow(b.port, { now, mode: 'recommended', preferredNodeId: 'a' }, settings(b), persistence);
  await act(b, local.session, 'read', second);
  await exchange(a, b);
  const learning = (await snapshot(b)).nodesById.a!.reading;
  await replayHistory(a, await open(a, second), entry, 'undo', '2026-10-26T08:03:00.000Z');
  await exchange(a, b);
  for (const peer of [a, b]) {
    expect((await snapshot(peer)).nodesById.a!.reading).toEqual(learning);
    expect((await open(peer, '2026-10-26T08:03:00.000Z')).readTopicCount).toBe(1);
  }
});

it('keeps the displayed article during passive sync and rejects a stale reading action', async () => {
  const [a, b] = await peers();
  await openDailyFlow(b.port, { now, mode: 'recommended', preferredNodeId: 'a' }, settings(b), persistence);
  await act(a, await open(a), 'read', first);
  await exchange(a, b);
  const passive = await openDailyFlow(b.port, { now: second, mode: 'recommended', preserveCurrent: true }, settings(b), persistence);
  expect(passive.session.currentNodeId).toBe('a');
  await expect(act(b, passive.session, 'read', second)).rejects.toThrow(/daily_flow_(learning_)?changed/);
  expect((await open(b, second)).currentNodeId).not.toBe('a');
});

it('applies received Soon before selecting the first local article', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'topic');
  await exchange(a, b);
  await historyEntry(a, 'a', 'soon', first);
  await exchange(a, b);
  expect(await readDailyFlow(b.port)).toBeNull();
  const started = await open(b, second);
  expect(started.currentNodeId).not.toBe('a');
  expect(started.readTopicCount).toBe(1);
  expect((await readCycleRows(b.port)).at(-1)).toMatchObject({ node_id: 'a', cohort: 'soon' });
});
