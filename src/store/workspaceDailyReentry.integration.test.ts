// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { act, assertDurable, node, now, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

const due = '2026-10-26T08:10:00.000Z';
const beforeDue = '2026-10-26T08:09:59.999Z';
afterEach(async () => { vi.restoreAllMocks(); await closeLibraries(); });

it.each(['empty', 'review', 'reading'] as const)('admits newly due minute reviews on same-mode reentry with %s current', async current => {
  const [peer] = await setupPeers();
  node(peer, 'minute', 'item');
  peer.db.exec("UPDATE nodes SET enable_short_term=1 WHERE id='minute'");
  const open = async (stamp: string) => (await openDailyFlow(peer.port,
    { now: stamp, mode: 'recommended' }, settings(peer), persistence)).session;
  let session = await open(now);
  session = await act(peer, session, 'grade');
  if (current !== 'empty') {
    node(peer, 'current', current === 'review' ? 'item' : 'topic');
    session = await open(now);
    expect(session.currentNodeId).toBe('current');
  }
  const initial = structuredClone(session);
  const reads = vi.spyOn(persistence, 'snapshot');
  session = await open(beforeDue);
  expect(session.queueNodeIds).not.toContain('minute');
  expect(session.currentNodeId).toBe(initial.currentNodeId);
  if (current !== 'empty') expect(reads).not.toHaveBeenCalled();
  session = await open(due);
  expect(session.queueNodeIds).toContain('minute');
  expect(session.currentNodeId).toBe(initial.currentNodeId ?? 'minute');
  expect(session.reviewedItemCount).toBe(1);
  await assertDurable(peer, session);
  reads.mockClear();
  expect(await open(due)).toEqual(session);
  expect(reads).not.toHaveBeenCalled();
});

it.each(['reading-only', 'recommended'] as const)('refreshes due reading in %s without interrupting the current', async mode => {
  const [peer] = await setupPeers();
  node(peer, 'current', mode === 'reading-only' ? 'topic' : 'item');
  if (mode === 'recommended') for (let i = 0; i < 5; i += 1) node(peer, `review-${i}`, 'item');
  node(peer, 'later', 'topic');
  peer.db.prepare("INSERT INTO node_reading (node_id, last_handled_at, next_at, repetition_count, state) VALUES ('later', '2026-10-26T08:00:00.000Z', ?, 1, 'active')").run(due);
  const open = async (stamp: string) => (await openDailyFlow(peer.port,
    { now: stamp, mode }, settings(peer), persistence)).session;
  const initial = await open(now);
  expect(initial.queueNodeIds).not.toContain('later');
  expect((await open(beforeDue)).queueNodeIds).toEqual(initial.queueNodeIds);
  const session = await open(due);
  expect(session.currentNodeId).toBe(initial.currentNodeId);
  expect(session.queueNodeIds).toEqual([...initial.queueNodeIds, 'later']);
  expect(peer.db.prepare("SELECT next_at FROM node_reading WHERE node_id='later'").get()).toEqual({ next_at: due });
  await assertDurable(peer, session);
});

it('keeps hidden Soon ordered when same-mode reentry admits a minute review', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b']) node(peer, id, 'topic');
  const open = async (stamp: string, mode: 'recommended' | 'review-first') =>
    (await openDailyFlow(peer.port, { now: stamp, mode }, settings(peer), persistence)).session;
  let session = await open(now, 'recommended');
  const [first, second] = session.queueNodeIds;
  session = await act(peer, session, 'soon');
  session = await act(peer, session, 'soon');
  node(peer, 'minute', 'item');
  node(peer, 'current', 'item');
  peer.db.exec("UPDATE nodes SET enable_short_term=1 WHERE id='minute'");
  session = (await openDailyFlow(peer.port, { now, mode: 'review-first', preferredNodeId: 'minute' }, settings(peer), persistence)).session;
  session = await act(peer, session, 'grade');
  expect(session.currentNodeId).toBe('current');
  expect(session.hiddenSoonNodeIds).toEqual([first, second]);
  session = await open(beforeDue, 'review-first');
  expect(session.queueNodeIds).not.toContain('minute');
  session = await open(due, 'review-first');
  expect(session.queueNodeIds).toEqual(['current', 'minute']);
  expect(session.hiddenSoonNodeIds).toEqual([first, second]);
  expect(session.readTopicCount).toBe(2);
  await assertDurable(peer, session);
  session = await open(due, 'recommended');
  expect(session.soonNodeIds).toEqual([first, second]);
  expect(session.queueNodeIds).toEqual(['current', 'minute']);
  await assertDurable(peer, session);
});
