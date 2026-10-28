// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { act, assertDurable, node, now, open, setupPeers } from '../test/dailyFlowExceptions.testSupport';

afterEach(async () => { vi.useRealTimers(); await closeLibraries(); });
it('clears at the initial task boundary and counts a later member only once after explicit re-entry', async () => {
  const [peer] = await setupPeers();
  node(peer, 'source-a', 'folder'); node(peer, 'source-b', 'folder');
  for (const id of ['a1', 'a2', 'a3', 'a4']) node(peer, id, 'topic', 'source-a');
  node(peer, 'b1', 'topic', 'source-b'); node(peer, 'b2', 'topic', 'source-b');
  const later = '2026-10-26T08:10:00.000Z';
  peer.db.prepare(`INSERT INTO node_reading (node_id,next_at,last_handled_at,interval_duration_ms,state)
    VALUES ('b2',?,?,86400000,'active')`).run(later, now);
  let session = await open(peer);
  expect((await readCycleRows(peer.port)).map(row => row.node_id)).toEqual(['a1', 'b1', 'a2', 'a3', 'b2', 'a4']);
  for (const id of ['a1', 'b1', 'a2', 'a3', 'a4']) {
    expect(session.currentNodeId).toBe(id);
    expect(session.cycle?.clearedAt).toBeNull();
    session = await act(peer, session, 'read');
  }
  expect(session).toMatchObject({ currentNodeId: null, totalNodeCount: 5, readTopicCount: 5,
    completedAt: now, cycle: { remaining: 0, clearedAt: now } });
  const waiting = (await readCycleRows(peer.port, ['b2']))[0]!;
  expect(waiting).toMatchObject({ initial_task: 0, handled: 0, active: 1 });
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  await vi.advanceTimersByTimeAsync(600000);
  expect((await readDailyFlow(peer.port))?.session).toEqual(session);
  vi.useRealTimers();
  session = await open(peer, later);
  expect(session.currentNodeId).toBe('b2');
  expect(session.cycle?.clearedAt).toBe(now);
  for (let index = 0; index < 2; index++) session = await act(peer, session, 'soon', later);
  expect(session.readTopicCount).toBe(6);
  expect(session.totalNodeCount).toBe(5);
  expect(session.cycle?.remaining).toBe(0);
  expect((await readCycleRows(peer.port, ['b2']))[0]).toMatchObject({ handled: 1, initial_task: 0 });
  await assertDurable(peer, session);
});
