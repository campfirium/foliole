// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { softDeleteNodes } from '../../lib/core/database/nodeMutations';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { act, assertDurable, due, exchange, node, now, open, persistence, publish, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(async () => { vi.restoreAllMocks(); await closeLibraries(); });

it.each(['delete', 'shelve', 'read'] as const)('retires hidden Soon after remote %s without losing the remaining order', async change => {
  const [desktop, mobile] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(desktop, id, 'topic');
  node(desktop, 'review', 'item');
  await exchange(desktop, mobile);
  let local = await open(mobile, now, settings(mobile), 'reading-only');
  const first = local.currentNodeId!;
  local = await act(mobile, local, 'soon');
  const second = local.currentNodeId!;
  local = await act(mobile, local, 'soon');
  local = await open(mobile);
  local = (await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence)).session;
  expect(local.currentNodeId).toBe('review');
  expect(local.soonNodeIds).toEqual([]);
  await exchange(mobile, desktop);
  if (change === 'delete') {
    softDeleteNodes(desktop.driver, { nodeIds: [first], deletedAt: due });
  } else if (change === 'shelve') {
    desktop.db.prepare('UPDATE nodes SET shelved_at=? WHERE id=?').run(due, first);
  } else {
    const remote = (await openDailyFlow(desktop.port, { now, mode: 'reading-only', preferredNodeId: first },
      settings(desktop), persistence)).session;
    await act(desktop, remote, 'read', due);
  }
  if (change !== 'read') publish(desktop, first);
  await exchange(desktop, mobile);
  // A pre-sync operation must not overwrite the new fact while reconciling its list.
  local = await act(mobile, local, 'grade', due);
  expect(local.currentNodeId).toBeNull();
  await assertDurable(mobile, local);
  local = await open(mobile, due);
  expect(local.currentNodeId).toBe(second);
  expect(local.queueNodeIds).not.toContain(first);
  expect(local.soonNodeIds).not.toContain(first);
  expect(local.readTopicCount).toBe(2);
  await assertDurable(mobile, local);
  await exchange(mobile, desktop);
  for (const peer of [desktop, mobile]) {
    const final = await open(peer, due);
    expect(final.queueNodeIds).not.toContain(first);
    expect(final.soonNodeIds).not.toContain(first);
    expect((await snapshot(peer)).nodesById[first]!.reading).toEqual((await snapshot(desktop)).nodesById[first]!.reading);
    await assertDurable(peer, final);
  }
});

it('rejects a stale review-only grade while retaining valid Soon after a synchronized grade', async () => {
  const [desktop, mobile] = await setupPeers();
  node(desktop, 'a', 'topic');
  node(desktop, 'b', 'topic');
  node(desktop, 'review', 'item');
  await exchange(desktop, mobile);
  let local = await open(mobile, now, settings(mobile), 'reading-only');
  const first = local.currentNodeId!;
  local = await act(mobile, local, 'soon');
  const second = local.currentNodeId!;
  local = await act(mobile, local, 'soon');
  local = await open(mobile);
  local = (await openDailyFlow(mobile.port, { now, mode: 'review-first' }, settings(mobile), persistence)).session;
  const remote = (await openDailyFlow(desktop.port, { now, mode: 'review-first' }, settings(desktop), persistence)).session;
  await act(desktop, remote, 'grade', due);
  await exchange(desktop, mobile);
  const facts = mobile.db.prepare('SELECT * FROM review_log ORDER BY op_id').all();
  await expect(act(mobile, local, 'grade', due)).rejects.toThrow('daily_flow_learning_changed');
  expect(mobile.db.prepare('SELECT * FROM review_log ORDER BY op_id').all()).toEqual(facts);
  local = await open(mobile, due);
  expect(local.currentNodeId).toBe(first);
  expect(local.soonNodeIds).toEqual([second]);
  expect(local.queueNodeIds).toEqual([]);
  await assertDurable(mobile, local);
});
