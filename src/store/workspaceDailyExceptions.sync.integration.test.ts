// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { restoreNodes, softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { resetNodeReviewState } from '../../lib/core/database/reviewMutations';
import { readCycleRows } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, due, exchange, node, now, open, persistence, publish, readView, setupPeers, settings, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(async () => { vi.restoreAllMocks(); await closeLibraries(); });

it('keeps current, Soon and completed facts across remote creation, deletion and restoration', async () => {
  const [desktop, mobile] = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd']) node(desktop, id, 'topic');
  await exchange(desktop, mobile);
  let local = await open(mobile, now, settings(mobile), 'reading-only');
  const completed = local.currentNodeId!;
  local = await act(mobile, local, 'read');
  const soon = local.currentNodeId!;
  local = await act(mobile, local, 'soon');
  const current = local.currentNodeId!;
  const removed = (await readView(mobile, now, 'reading-only')).find(id => id !== current && id !== soon)!;
  await exchange(mobile, desktop);
  node(desktop, 'new-topic', 'topic');
  softDeleteNodes(desktop.driver, { nodeIds: [removed], deletedAt: due });
  publish(desktop, removed);
  await exchange(desktop, mobile);
  local = await open(mobile, due, settings(mobile), 'reading-only');
  expect(local.currentNodeId).toBe(current);
  expect((await readCycleRows(mobile.port, [soon]))[0]).toMatchObject({ active: 1, cohort: 'soon' });
  expect(local.queueNodeIds).not.toContain(removed);
  expect(local.queueNodeIds).not.toContain(completed);
  await assertDurable(mobile, local);
  restoreNodes(desktop.driver, { nodeIds: [removed] });
  publish(desktop, removed, '2026-10-26T08:02:00.000Z');
  await exchange(desktop, mobile);
  local = await open(mobile, due, settings(mobile), 'reading-only');
  expect(local.currentNodeId).toBe(current);
  expect((await readCycleRows(mobile.port, [soon]))[0]).toMatchObject({ active: 1, cohort: 'soon' });
  expect(local.queueNodeIds).not.toContain(completed);
  local = await act(mobile, local, 'read', due);
  expect(local.currentNodeId).toBe(soon);
  local = await act(mobile, local, 'read', due);
  expect(new Set(await readView(mobile, due, 'reading-only'))).toEqual(new Set([removed, 'new-topic']));
  await assertDurable(mobile, local);
  await exchange(mobile, desktop);
  const remote = await open(desktop, due, settings(desktop), 'reading-only');
  expect(new Set(await readView(desktop, due, 'reading-only'))).toEqual(new Set([removed, 'new-topic']));
  await assertDurable(desktop, remote);
  expect((await snapshot(desktop)).nodesById[completed]!.reading).toEqual((await snapshot(mobile)).nodesById[completed]!.reading);
});

it('admits a remote relearn after synchronized grading and keeps the remaining mixed progress', async () => {
  const [desktop, mobile] = await setupPeers();
  for (let i = 0; i < 12; i += 1) node(desktop, `item-${i}`, 'item');
  for (let i = 0; i < 3; i += 1) node(desktop, `topic-${i}`, 'topic');
  await exchange(desktop, mobile);
  let local = await open(mobile);
  const first = local.currentNodeId!;
  local = await act(mobile, local, 'grade');
  const remaining = await readView(mobile);
  const current = local.currentNodeId;
  await exchange(mobile, desktop);
  const remote = await open(desktop);
  expect(remote.queueNodeIds).not.toContain(first);
  resetNodeReviewState(desktop.driver, first, { hostName: desktop.name, deletedAt: due });
  await exchange(desktop, mobile);
  local = await open(mobile, due);
  expect(local.currentNodeId).toBe(current);
  expect((await readView(mobile, due)).filter(id => id !== first)).toEqual(remaining);
  expect((await readCycleRows(mobile.port, [first]))[0]?.active).toBe(1);
  expect((await snapshot(mobile)).nodesById[first]!.review).toBeNull();
  const reads = vi.spyOn(persistence, 'snapshot');
  local = await act(mobile, local, 'grade', due);
  // The action helper reads the UI snapshot once; persistence itself must use scoped reads.
  expect(reads.mock.calls.slice(1).every(call => call[1] !== undefined)).toBe(true);
  expect(local.currentNodeId).toBe(remaining[1]);
  await exchange(mobile, desktop);
  for (const peer of [desktop, mobile]) {
    const final = await open(peer, due);
    expect((await readCycleRows(peer.port, [first]))[0]?.active).toBe(1);
    await assertDurable(peer, final);
  }
});

it('rejects a stale grade after the remote authority grades it and resumes the latest durable list', async () => {
  const [desktop, mobile] = await setupPeers();
  for (let i = 0; i < 4; i += 1) node(desktop, `item-${i}`, 'item');
  await exchange(desktop, mobile);
  const stale = await open(mobile);
  const remote = await open(desktop);
  expect(stale.currentNodeId).toBe(remote.currentNodeId);
  const committed = await act(desktop, remote, 'grade');
  await exchange(desktop, mobile);
  const facts = mobile.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  await expect(act(mobile, stale, 'grade')).rejects.toThrow('daily_flow_changed');
  expect(mobile.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
  for (const peer of [desktop, mobile]) {
    const final = await open(peer);
    expect(final.currentNodeId).toBe(committed.currentNodeId);
    expect(final.queueNodeIds).not.toContain(stale.currentNodeId);
    expect((await snapshot(peer)).nodesById[stale.currentNodeId!]!.review!.reps).toBe(1);
    await assertDurable(peer, final);
  }
});

it.each(['grade', 'soon'] as const)('saves the displayed successor on the first %s after the previous current is deleted', async action => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b']) node(peer, id, action === 'grade' ? 'item' : 'topic');
  const source = await open(peer);
  const removed = source.currentNodeId!;
  const next = (await readView(peer))[1]!;
  softDeleteNodes(peer.driver, { nodeIds: [removed], deletedAt: due });
  const displayed = { ...source, currentNodeId: next, queueNodeIds: source.queueNodeIds.filter(id => id !== removed) };
  const saved = await act(peer, displayed, action, due);
  expect((await readCycleRows(peer.port, [removed]))[0]?.active).toBe(0);
  expect((saved.readTopicCount ?? 0) + (saved.reviewedItemCount ?? 0)).toBe(1);
  expect(saved.cycle?.remaining).toBe(0);
  await assertDurable(peer, saved);
});
