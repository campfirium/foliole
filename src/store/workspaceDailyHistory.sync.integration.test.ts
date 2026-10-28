// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { dailyFlowHistoryCommand } from '../../lib/core/flow/dailyFlowHistory';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows } from '../../lib/core/flow/dailyFlowStorage';
import { reviewHistoryOpId } from '../../lib/core/review/reviewEventIdentity';
import { assertDurable, exchange, node, open, readView, setupPeers, settings, persistence } from '../test/dailyFlowExceptions.testSupport';
import { historyEntry, replayHistory } from '../test/dailyFlowHistorySync.testSupport';

afterEach(closeLibraries);

it('undoes only the selected rating after an offline peer rates the same item later', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  await exchange(a, b);
  const entry = await historyEntry(a, 'a', 'grade', '2026-10-26T08:01:00.000Z');
  await historyEntry(b, 'a', 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const result = await replayHistory(a, await open(a, '2026-10-26T08:03:00.000Z'), entry, 'undo', '2026-10-26T08:03:00.000Z');
  await exchange(a, b);
  for (const peer of [a, b]) {
    const final = await open(peer, '2026-10-26T08:03:00.000Z');
    expect(peer.db.prepare("SELECT reps FROM node_review WHERE node_id='a'").get()).toEqual({ reps: 1 });
    expect(peer.db.prepare('SELECT * FROM review_log WHERE kind=\'review\'').all()).toHaveLength(2);
    expect(final.reviewedItemCount).toBe(1);
    expect(await readView(peer, '2026-10-26T08:03:00.000Z')).not.toContain('a');
    await assertDurable(peer, final);
  }
  expect(result.card?.reps).toBe(1);
  expect(await readCycleRows(a.port)).toEqual(await readCycleRows(b.port));
});

it('undoes one Soon contribution after synchronization without removing another pending Soon', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'topic');
  await exchange(a, b);
  const entry = await historyEntry(a, 'a', 'soon', '2026-10-26T08:01:00.000Z');
  await historyEntry(b, 'b', 'soon', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  await replayHistory(a, await open(a, '2026-10-26T08:03:00.000Z'), entry, 'undo', '2026-10-26T08:03:00.000Z');
  await exchange(a, b);
  for (const peer of [a, b]) {
    const final = await open(peer, '2026-10-26T08:03:00.000Z');
    expect(final.readTopicCount).toBe(1);
    const rows = await readCycleRows(peer.port);
    expect(rows.find(row => row.node_id === 'a')).toMatchObject({ handled: 0, initial_task: 1, cohort: 'queue' });
    expect(rows.find(row => row.node_id === 'b')).toMatchObject({ handled: 1, initial_task: 0, cohort: 'soon' });
    await assertDurable(peer, final);
  }
});

it('restores an undone rating without dropping peer progress and targets the redo on a second undo', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  await exchange(a, b);
  const entry = await historyEntry(a, 'a', 'grade', '2026-10-26T08:01:00.000Z');
  await historyEntry(b, 'b', 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const undo = await replayHistory(a, await open(a, '2026-10-26T08:03:00.000Z'), entry, 'undo', '2026-10-26T08:03:00.000Z');
  expect(undo.session.reviewedItemCount).toBe(1);
  expect(undo.session.currentNodeId).toBe('a');
  await exchange(a, b);
  const redo = await replayHistory(a, await open(a, '2026-10-26T08:04:00.000Z'), entry, 'redo', '2026-10-26T08:04:00.000Z');
  expect(redo.session.reviewedItemCount).toBe(2);
  await exchange(a, b);
  const redoId = reviewHistoryOpId(entry.id, '2026-10-26T08:04:00.000Z', 'redo');
  const replayedEntry = { ...entry, reviewOpId: redoId };
  await replayHistory(a, await open(a, '2026-10-26T08:05:00.000Z'), replayedEntry, 'undo', '2026-10-26T08:05:00.000Z');
  await exchange(b, a); await exchange(a, b);
  for (const peer of [a, b]) {
    const final = await open(peer, '2026-10-26T08:05:00.000Z');
    expect(final.reviewedItemCount).toBe(1);
    expect(peer.db.prepare("SELECT reps FROM node_review WHERE node_id='a'").get()).toBeUndefined();
    expect(peer.db.prepare("SELECT reps FROM node_review WHERE node_id='b'").get()).toEqual({ reps: 1 });
    await assertDurable(peer, final);
  }
});

it('rolls back a targeted undo completely and safely retries its lost acknowledgement', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'item');
  await exchange(a, b);
  const entry = await historyEntry(a, 'a', 'grade', '2026-10-26T08:01:00.000Z');
  await historyEntry(b, 'b', 'grade', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const session = await open(a, '2026-10-26T08:03:00.000Z');
  const command = dailyFlowHistoryCommand({ session, entry, mode: 'undo', now: '2026-10-26T08:03:00.000Z' });
  const facts = a.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  const rows = await readCycleRows(a.port);
  const flow = a.db.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all();
  a.db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  await expect(commitDailyFlow(a.port, command, settings(a), persistence)).rejects.toThrow('disk full');
  expect(a.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
  expect(a.db.prepare('SELECT * FROM daily_flow_sync_facts ORDER BY id').all()).toEqual(flow);
  expect(await readCycleRows(a.port)).toEqual(rows);
  a.db.exec('DROP TRIGGER reject_history');
  const first = await commitDailyFlow(a.port, command, settings(a), persistence);
  const retry = await commitDailyFlow(a.port, command, settings(a), persistence);
  expect(retry.replayed).toBe(true);
  expect(retry.session).toEqual(first.session);
  expect(retry.learning).toEqual(first.learning);
  await exchange(a, b);
  expect((await open(b, '2026-10-26T08:03:00.000Z')).reviewedItemCount).toBe(1);
});

it.each(['earlier', 'later'] as const)('undoes the %s offline reading while retaining the other effective reading', async which => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(a, id, 'topic');
  await exchange(a, b);
  const first = await historyEntry(a, 'a', 'read', '2026-10-26T08:01:00.000Z');
  const second = await historyEntry(b, 'a', 'read', '2026-10-26T08:02:00.000Z');
  await exchange(a, b);
  const peer = which === 'earlier' ? a : b;
  const kept = which === 'earlier' ? second : first;
  await replayHistory(peer, await open(peer, '2026-10-26T08:03:00.000Z'), which === 'earlier' ? first : second,
    'undo', '2026-10-26T08:03:00.000Z');
  expect(peer.db.prepare("SELECT last_handled_at FROM node_reading WHERE node_id='a'").get())
    .toEqual({ last_handled_at: 'afterReading' in kept ? kept.afterReading!.lastHandledAt : '' });
  await exchange(a, b);
  for (const current of [a, b]) {
    const final = await open(current, '2026-10-26T08:03:00.000Z');
    expect(final.readTopicCount).toBe(1);
    expect(current.db.prepare("SELECT last_handled_at FROM node_reading WHERE node_id='a'").get())
      .toEqual({ last_handled_at: 'afterReading' in kept ? kept.afterReading!.lastHandledAt : '' });
    expect(await readView(current, '2026-10-26T08:03:00.000Z')).not.toContain('a');
    await assertDurable(current, final);
  }
});

it('keeps an independent redo when a peer later voids only the original rating', async () => {
  const [a, b] = await setupPeers();
  for (const id of ['a', 'b']) node(a, id, 'item');
  await exchange(a, b);
  const entry = await historyEntry(a, 'a', 'grade', '2026-10-26T08:01:00.000Z');
  await exchange(a, b);
  await replayHistory(a, await open(a, '2026-10-26T08:02:00.000Z'), entry, 'undo', '2026-10-26T08:02:00.000Z');
  await replayHistory(a, await open(a, '2026-10-26T08:03:00.000Z'), entry, 'redo', '2026-10-26T08:03:00.000Z');
  await replayHistory(b, await open(b, '2026-10-26T08:04:00.000Z'), entry, 'undo', '2026-10-26T08:04:00.000Z');
  await exchange(a, b);
  for (const peer of [a, b]) {
    const final = await open(peer, '2026-10-26T08:04:00.000Z');
    expect(final.reviewedItemCount).toBe(1);
    expect(peer.db.prepare("SELECT reps FROM node_review WHERE node_id='a'").get()).toEqual({ reps: 1 });
    await assertDurable(peer, final);
  }
});
