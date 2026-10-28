// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, node, now, open, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('persists and reopens the complete daily list without derived list fingerprints', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const first = await open(peer);
  const rows = await readCycleRows(peer.port);
  expect(rows.map(row => row.node_id).sort()).toEqual(['a', 'b']);
  expect(first.cycle).not.toHaveProperty('rowsHash');
  expect(first.cycle).not.toHaveProperty('stamp');
  const stored = (await readDailyFlow(peer.port))!;
  expect(JSON.parse(stored.session_json).cycle).not.toHaveProperty('rowsHash');
  expect(JSON.parse(stored.session_json).cycle).not.toHaveProperty('stamp');
  const advanced = await act(peer, first, 'soon');
  expect(advanced.cycle?.change?.before).toEqual([rows.find(row => row.node_id === first.currentNodeId)]);
  expect(advanced.cycle?.change?.after[0]).toMatchObject({ node_id: first.currentNodeId, cohort: 'soon', handled: 1 });
  expect(await open(peer)).toEqual(advanced);
  expect((await readCycleRows(peer.port)).map(row => row.node_id).sort()).toEqual(['a', 'b']);
});

it('reads retired fingerprint fields without changing rows and omits them on the next save', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const first = await open(peer);
  const rows = await readCycleRows(peer.port);
  // A saved pre-removal session is fixture data, not a substitute for opening Flow.
  peer.db.prepare(`UPDATE daily_flow_state SET session_json=json_set(session_json,
    '$.cycle.rowsHash', ?, '$.cycle.stamp', ?)`).run('old-row-fingerprint', 'old-session-fingerprint');
  const reopened = await open(peer);
  expect(reopened).toEqual(first);
  expect(await readCycleRows(peer.port)).toEqual(rows);
  await openDailyFlow(peer.port, { now, mode: 'recommended', refresh: true }, settings(peer), persistence);
  const stored = JSON.parse((await readDailyFlow(peer.port))!.session_json);
  expect(stored.cycle).not.toHaveProperty('rowsHash');
  expect(stored.cycle).not.toHaveProperty('stamp');
  expect(await readCycleRows(peer.port)).toEqual(rows);
});

it('restores the exact changed rows and progress through undo and redo without list fingerprints', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const first = await open(peer);
  const before = await readCycleRows(peer.port);
  const current = first.currentNodeId!;
  const readings = [{ nodeId: current, before: null, after: null }];
  const moved = await commitDailyFlow(peer.port, { opId: 'soon', now, token: first.daily!,
    sourceSession: first, readingAction: 'soon', readings }, settings(peer), persistence);
  const after = await readCycleRows(peer.port);
  const change = moved.session.cycle!.change!;
  const undo = { opId: 'undo', now, token: moved.session.daily!,
    sourceSession: moved.session, historySourceSession: moved.session, nextSession: first,
    historyMode: 'undo' as const, cycleReplay: change, readings };
  const invalid = { ...change, after: change.after.map(row => ({ ...row, handled: 0 as const })) };
  await expect(commitDailyFlow(peer.port, { ...undo, cycleReplay: invalid }, settings(peer), persistence))
    .rejects.toThrow('flow_history_changed');
  expect(await readCycleRows(peer.port)).toEqual(after);
  peer.db.exec(`CREATE TEMP TRIGGER reject_history_save BEFORE INSERT ON daily_flow_state
    BEGIN SELECT RAISE(ABORT, 'history save failed'); END`);
  await expect(commitDailyFlow(peer.port, undo, settings(peer), persistence)).rejects.toThrow('history save failed');
  expect(await readCycleRows(peer.port)).toEqual(after);
  expect((await readDailyFlow(peer.port))?.session).toEqual(moved.session);
  expect(peer.db.prepare("SELECT * FROM daily_flow_operations WHERE op_id='undo'").all()).toEqual([]);
  peer.db.exec('DROP TRIGGER reject_history_save');
  const undone = await commitDailyFlow(peer.port, undo, settings(peer), persistence);
  expect(await readCycleRows(peer.port)).toEqual(before);
  expect(undone.session.currentNodeId).toBe(current);
  expect(undone.session.cycle?.remaining).toBe(first.cycle?.remaining);
  const redone = await commitDailyFlow(peer.port, { opId: 'redo', now, token: undone.session.daily!,
    sourceSession: undone.session, historySourceSession: first, nextSession: moved.session,
    historyMode: 'redo', cycleReplay: change, readings }, settings(peer), persistence);
  expect(await readCycleRows(peer.port)).toEqual(after);
  expect(redone.session.currentNodeId).toBe(moved.session.currentNodeId);
  expect(redone.session.cycle?.remaining).toBe(moved.session.cycle?.remaining);
  await assertDurable(peer, redone.session);
});

it('accepts an unchanged refreshed cursor and checks current learning facts before advancing', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const first = await open(peer);
  const refreshed = await openDailyFlow(peer.port, { now, mode: 'recommended', refresh: true }, settings(peer), persistence);
  expect(refreshed.session.daily!.revision).toBeGreaterThan(first.daily!.revision);
  const moved = await act(peer, first, 'soon');
  expect(moved.currentNodeId).not.toBe(first.currentNodeId);
  expect(moved.readTopicCount).toBe(1);
  await assertDurable(peer, moved);
});

it('undoes a local row change while retaining an unrelated arrival in the daily list', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const first = await open(peer);
  const rows = await readCycleRows(peer.port);
  const readings = [{ nodeId: first.currentNodeId!, before: null, after: null }];
  const moved = await commitDailyFlow(peer.port, { opId: 'soon', now, token: first.daily!,
    sourceSession: first, readingAction: 'soon', readings }, settings(peer), persistence);
  node(peer, 'arrival', 'topic');
  const reconciled = await open(peer);
  const [arrival] = await readCycleRows(peer.port, ['arrival']);
  expect(arrival).toBeDefined();
  expect(reconciled.currentNodeId).toBe(moved.session.currentNodeId);
  const restored = await commitDailyFlow(peer.port, { opId: 'undo', now, token: reconciled.daily!,
    sourceSession: reconciled, historySourceSession: moved.session, nextSession: first,
    historyMode: 'undo', cycleReplay: moved.session.cycle!.change, readings }, settings(peer), persistence);
  expect(await readCycleRows(peer.port, ['arrival'])).toEqual([arrival]);
  expect(await readCycleRows(peer.port, ['a', 'b'])).toEqual(rows);
  expect(restored.session.currentNodeId).toBe(first.currentNodeId);
  expect(restored.session.cycle?.tailKey).toBe(reconciled.cycle?.tailKey);
  await assertDurable(peer, restored.session);
});

it('reaches a waiting topic despite repeated Soon, new arrivals and a restart-equivalent reopen', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic'); node(peer, 'waiting', 'topic');
  peer.db.prepare("UPDATE nodes SET created_at=? WHERE id='waiting'").run('2026-10-26T08:01:00.000Z');
  let session = await open(peer, now, settings(peer), 'reading-only');
  const initial = new Set(session.queueNodeIds);
  session = await act(peer, session, 'soon');
  session = await act(peer, session, 'soon');
  expect(session.cycle?.clearedAt).toBeTruthy();
  expect(initial.has(session.currentNodeId!)).toBe(true);
  const waiting = (await readCycleRows(peer.port, ['waiting']))[0]!;
  const cursor = { ...session.cycle! };
  node(peer, 'new', 'topic');
  session = await open(peer, '2026-10-26T08:02:00.000Z', settings(peer), 'reading-only');
  expect(session.currentNodeId).not.toBe('waiting');
  expect(session.cycle?.scanAfter).toBe(cursor.scanAfter);
  expect((await readCycleRows(peer.port, ['waiting']))[0]).toEqual(waiting);
  for (let step = 0; step < 3 && session.currentNodeId !== 'waiting'; step++) {
    session = await act(peer, session, 'soon', '2026-10-26T08:02:00.000Z');
  }
  expect(session.currentNodeId).toBe('waiting');
  expect(session.readTopicCount).toBe(2);
  await assertDurable(peer, session);
  expect(session.queueNodeIds.length).toBeLessThanOrEqual(2);
});

it('keeps sleeping and mode-hidden rows in place and returns without spinning when none is ready', async () => {
  node(peer, 'waiting', 'topic');
  peer.db.prepare("UPDATE nodes SET created_at=? WHERE id='waiting'").run('2026-10-26T08:01:00.000Z');
  let session = (await openDailyFlow(peer.port, { now, mode: 'review-first' }, settings(peer), persistence)).session;
  expect(session.currentNodeId).toBeNull();
  const row = (await readCycleRows(peer.port, ['waiting']))[0];
  session = await open(peer, now, settings(peer), 'reading-only');
  expect(session.currentNodeId).toBeNull();
  expect((await readCycleRows(peer.port, ['waiting']))[0]).toEqual(row);
  session = await open(peer, '2026-10-26T08:02:00.000Z', settings(peer), 'reading-only');
  expect(session.currentNodeId).toBe('waiting');
  expect((await readCycleRows(peer.port, ['waiting']))[0]).toEqual(row);
  expect((await readDailyFlow(peer.port))?.session).toEqual(session);
});

it('reuses one identity for a single topic repeatedly sent Soon and counts its initial pass once', async () => {
  node(peer, 'a', 'topic');
  let session = await open(peer, now, settings(peer), 'reading-only');
  for (let index = 0; index < 6; index++) session = await act(peer, session, 'soon');
  expect(session.currentNodeId).toBe('a');
  expect(session.readTopicCount).toBe(1);
  expect(session.cycle?.remaining).toBe(0);
  expect(session.cycle?.clearedAt).toBeTruthy();
  expect(await readCycleRows(peer.port)).toHaveLength(1);
});
