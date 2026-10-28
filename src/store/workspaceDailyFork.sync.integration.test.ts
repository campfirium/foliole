// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, exchange, node, now, open, persistence, readView, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

async function select(peer: Peer, id: string, stamp = now) {
  return (await openDailyFlow(peer.port, { now: stamp, mode: 'recommended', preferredNodeId: id },
    settings(peer), persistence)).session;
}

async function seed(shortTerm?: boolean) {
  const peers = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd']) node(peers[0], id, 'item', null, shortTerm);
  await exchange(...peers);
  return peers;
}

async function expectConverged(a: Peer, b: Peer, stamp: string, reviewed: number) {
  const left = await open(a, stamp); const right = await open(b, stamp);
  expect(await readCycleRows(a.port)).toEqual(await readCycleRows(b.port));
  expect(await readView(a, stamp)).toEqual(await readView(b, stamp));
  expect(left.currentNodeId).toBe(right.currentNodeId);
  expect(left.reviewedItemCount).toBe(reviewed);
  expect(right.reviewedItemCount).toBe(reviewed);
  expect(left.cycle!.remaining).toBe(right.cycle!.remaining);
  const facts = (peer: Peer) => peer.db.prepare('SELECT op_id, grade, kind, reviewed_at FROM review_log ORDER BY op_id').all();
  expect(facts(a)).toEqual(facts(b));
  const rows = await readCycleRows(a.port);
  for (const peer of [a, b]) {
    const reader = new Database(peer.file, { readonly: true });
    try {
      expect(reader.prepare('SELECT * FROM daily_flow_entries ORDER BY order_key').all()).toEqual(rows);
      const saved = reader.prepare('SELECT session_json FROM daily_flow_state').get() as { session_json: string };
      expect(JSON.parse(saved.session_json)).toMatchObject({ currentNodeId: left.currentNodeId, reviewedItemCount: reviewed });
      expect(reader.prepare('SELECT op_id, grade, kind, reviewed_at FROM review_log ORDER BY op_id').all()).toEqual(facts(a));
    } finally { reader.close(); }
  }
  await exchange(b, a);
  expect((await open(a, stamp)).currentNodeId).toBe(left.currentNodeId);
  expect((await open(b, stamp)).currentNodeId).toBe(left.currentNodeId);
  expect(await readCycleRows(a.port)).toEqual(await readCycleRows(b.port));
}

it('chooses the most recently advanced independent list and merges different completed items', async () => {
  const [a, b] = await seed();
  const first = await select(a, 'a');
  await select(b, 'c');
  const second = await select(b, 'b');
  await act(a, first, 'grade', '2026-10-26T08:01:00.000Z');
  const latest = await act(b, second, 'grade', '2026-10-26T08:02:00.000Z');
  const root = b.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get();
  const expected = (await readView(b, '2026-10-26T08:02:00.000Z')).filter(id => id !== 'a' && id !== 'b');
  await exchange(a, b);
  expect(a.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get()).toEqual(root);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 2);
  expect(await readView(a, '2026-10-26T08:02:00.000Z')).not.toContain('a');
  expect(await readView(a, '2026-10-26T08:02:00.000Z')).not.toContain('b');
  expect((await readDailyFlow(a.port))!.session.currentNodeId).toBe(latest.currentNodeId);
  expect(await readView(a, '2026-10-26T08:02:00.000Z')).toEqual(expected);
});

it('merges two offline branches of the same list without dropping either rating', async () => {
  const [a, b] = await seed();
  await open(a); await exchange(a, b);
  const first = await select(a, 'a'); const second = await select(b, 'b');
  await act(a, first, 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, second, 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(b, a);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 2);
});

it('preserves two genuine ratings of the same item while counting that daily item once', async () => {
  const [a, b] = await seed();
  const first = await select(a, 'a'); const second = await select(b, 'a');
  await act(a, first, 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, second, 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 1);
  expect(a.db.prepare("SELECT reps FROM node_review WHERE node_id='a'").get()).toEqual({ reps: 2 });
  expect(a.db.prepare('SELECT * FROM review_log').all()).toHaveLength(2);
});

it('does not let opening or refreshing an unadvanced list replace a real progress position', async () => {
  const [a, b] = await seed();
  await select(a, 'a');
  const latest = await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z');
  const winner = b.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get();
  await openDailyFlow(a.port, { now: '2026-10-26T08:03:00.000Z', mode: 'recommended', refresh: true }, settings(a), persistence);
  await exchange(a, b);
  expect(a.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get()).toEqual(winner);
  expect((await open(a, '2026-10-26T08:03:00.000Z')).currentNodeId).toBe(latest.currentNodeId);
  await expectConverged(a, b, '2026-10-26T08:03:00.000Z', 1);
});

it('uses operation identity to break equal offline timestamps and preserves the same winner in both sync directions', async () => {
  const [a, b] = await seed();
  await act(a, await select(a, 'a'), 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:01:00.000Z');
  const heads = [a, b].map(peer => peer.db.prepare('SELECT root_id, head_id FROM daily_flow_sync_projection').get() as { root_id: string; head_id: string });
  const winner = heads.sort((left, right) => left.head_id < right.head_id ? -1 : 1).at(-1)!;
  await exchange(b, a);
  expect(a.db.prepare('SELECT root_id FROM daily_flow_sync_projection').get()).toEqual({ root_id: winner.root_id });
  await expectConverged(a, b, '2026-10-26T08:01:00.000Z', 2);
});

it('retains both pending Soon items after offline forks and keeps the last real continuation', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd']) node(a, id, 'topic');
  await exchange(a, b);
  await act(a, await select(a, 'a'), 'soon', '2026-10-26T08:01:00.000Z');
  const latest = await act(b, await select(b, 'b'), 'soon', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const left = await open(a, '2026-10-26T08:02:00.000Z');
  const right = await open(b, '2026-10-26T08:02:00.000Z');
  expect(left.currentNodeId).toBe(latest.currentNodeId);
  expect(right.currentNodeId).toBe(latest.currentNodeId);
  expect(left.readTopicCount).toBe(2);
  expect(right.readTopicCount).toBe(2);
  expect(await readCycleRows(a.port)).toEqual(await readCycleRows(b.port));
  const rows = await readCycleRows(a.port);
  for (const id of ['a', 'b']) expect(rows.find(row => row.node_id === id))
    .toMatchObject({ active: 1, initial_task: 0, handled: 1, cohort: 'soon' });
  expect(await readView(a, '2026-10-26T08:02:00.000Z')).toEqual(await readView(b, '2026-10-26T08:02:00.000Z'));
});

it('allows a handled Again item to become ready again without reviving its original daily task', async () => {
  const [a, b] = await seed(true);
  await act(a, await select(a, 'a'), 'grade', '2026-10-26T08:01:00.000Z', settings(a), 1);
  await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z', settings(b), 1);
  await exchange(a, b);
  const scheduled = a.db.prepare("SELECT MAX(due) AS due FROM node_review WHERE node_id IN ('a','b')").get() as { due: string };
  await expectConverged(a, b, scheduled.due, 2);
  const visible = await readView(a, scheduled.due);
  expect(visible).toContain('a'); expect(visible).toContain('b');
  for (const row of (await readCycleRows(a.port)).filter(row => row.node_id === 'a' || row.node_id === 'b')) {
    expect(row).toMatchObject({ handled: 1, initial_task: 0 });
  }
});

it('continues after merging without double counting the other branch elapsed time', async () => {
  const [a, b] = await seed();
  await act(a, await select(a, 'a'), 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const continuing = await open(b, '2026-10-26T08:02:00.000Z');
  expect(continuing.reviewElapsedMs).toBe(180_000);
  await act(b, continuing, 'grade', '2026-10-26T08:03:00.000Z');
  await exchange(b, a);
  await expectConverged(a, b, '2026-10-26T08:03:00.000Z', 3);
  expect((await readDailyFlow(a.port))!.session.reviewElapsedMs).toBe(240_000);
  expect((await readDailyFlow(b.port))!.session.reviewElapsedMs).toBe(240_000);
});

it('orders a new operation after already synchronized progress even when its device clock is behind', async () => {
  const [a, b] = await seed();
  await act(a, await select(a, 'a'), 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const continuing = await open(b, '2026-10-26T08:02:00.000Z');
  await act(b, continuing, 'grade', '2026-10-26T08:01:00.000Z');
  const latest = b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').get();
  await exchange(a, b);
  expect(a.db.prepare('SELECT head_id FROM daily_flow_sync_projection').get()).toEqual(latest);
  expect(b.db.prepare('SELECT head_id FROM daily_flow_sync_projection').get()).toEqual(latest);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 3);
});

it('merges independently created, still active day intervals and retains the advancing winner interval', async () => {
  const [a, b] = await seed();
  const alternate = { start: '2026-10-26T06:30:00.000Z', end: '2026-10-27T06:30:00.000Z' };
  const first = (await openDailyFlow(a.port, { now, mode: 'recommended', preferredNodeId: 'a' },
    { ...settings(a), dayWindow: alternate }, persistence)).session;
  await act(a, first, 'grade', '2026-10-26T08:01:00.000Z');
  const latest = await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 2);
  expect((await readDailyFlow(a.port))!.session.dayWindow).toEqual(latest.dayWindow);
});

it('does not bring an expired list completion count into the next daily list', async () => {
  const [a, b] = await seed();
  const priorWindow = { start: '2026-10-26T06:30:00.000Z', end: '2026-10-27T06:30:00.000Z' };
  const first = (await openDailyFlow(a.port, { now, mode: 'recommended', preferredNodeId: 'a' },
    { ...settings(a), dayWindow: priorWindow }, persistence)).session;
  await act(a, first, 'grade', '2026-10-26T08:01:00.000Z');
  const tomorrow = await select(b, 'b', '2026-10-27T08:00:00.000Z');
  const latest = await act(b, tomorrow, 'grade', '2026-10-27T08:01:00.000Z');
  await exchange(a, b);
  await expectConverged(a, b, '2026-10-27T08:01:00.000Z', 1);
  expect((await readDailyFlow(a.port))!.session.dayWindow).toEqual(latest.dayWindow);
  expect(a.db.prepare('SELECT * FROM review_log').all()).toHaveLength(2);
});

it('recovers a failed merged projection without losing either locally committed rating', async () => {
  const [a, b] = await seed();
  await act(a, await select(a, 'a'), 'grade', '2026-10-26T08:01:00.000Z');
  await act(b, await select(b, 'b'), 'grade', '2026-10-26T08:02:00.000Z');
  const rows = await readCycleRows(b.port);
  const saved = (await readDailyFlow(b.port))!.session_json;
  b.db.exec(`CREATE TRIGGER reject_merge BEFORE INSERT ON daily_flow_entries
    BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
  await expect(exchange(a, b)).rejects.toThrow('disk full');
  expect(await readCycleRows(b.port)).toEqual(rows);
  expect((await readDailyFlow(b.port))!.session_json).toBe(saved);
  expect(a.db.prepare("SELECT COUNT(*) AS total FROM review_log WHERE node_id='a'").get()).toEqual({ total: 1 });
  expect(b.db.prepare("SELECT COUNT(*) AS total FROM review_log WHERE node_id='b'").get()).toEqual({ total: 1 });
  b.db.exec('DROP TRIGGER reject_merge');
  await exchange(a, b);
  await expectConverged(a, b, '2026-10-26T08:02:00.000Z', 2);
});
