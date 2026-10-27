// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, node, now, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('decides startup fallback before assigning initial tasks and persists the effective mode', async () => {
  node(peer, 'reading', 'topic');
  const result = await openDailyFlow(peer.port, { now, mode: 'review-first', startup: true }, settings(peer), persistence);
  expect(result.session.currentNodeId).toBe('reading');
  expect(result.mode).toBe('recommended');
  expect(result.session.totalNodeCount).toBe(1);
  expect(result.session.cycle?.remaining).toBe(1);
  expect((await readCycleRows(peer.port))[0]?.initial_task).toBe(1);
  await assertDurable(peer, result.session);
  const explicit = await openDailyFlow(peer.port, { now, mode: 'review-first' }, settings(peer), persistence);
  expect(explicit.session.currentNodeId).toBeNull();
  expect(explicit.mode).toBe('review-first');
});

it('returns the durable current when the requested target is no longer eligible', async () => {
  node(peer, 'first', 'topic'); node(peer, 'next', 'topic');
  const first = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), persistence);
  const requested = first.session.currentNodeId!;
  const next = await act(peer, first.session, 'read');
  const resumed = await openDailyFlow(peer.port, { now, mode: 'reading-only', preferredNodeId: requested,
    seed: first.session }, settings(peer), persistence);
  expect(resumed.session.currentNodeId).toBe(next.currentNodeId);
  expect(resumed.session.currentNodeId).not.toBe(requested);
  expect(resumed.session.readTopicCount).toBe(1);
  await assertDurable(peer, resumed.session);
});

it('preserves a legal same-day legacy seed and ignores replacement arrays after cycle creation', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic'); node(peer, 'c', 'topic');
  const seed = { currentNodeId: 'b', queueNodeIds: ['b', 'a'], soonNodeIds: ['c'], isAnswerRevealed: false,
    totalNodeCount: 5, sessionStartedAt: now, currentItemStartedAt: now, readTopicCount: 2, readingElapsedMs: 1200 };
  const result = await openDailyFlow(peer.port, { now, mode: 'reading-only', seed }, settings(peer), persistence);
  expect(result.session).toMatchObject({ currentNodeId: 'b', sessionStartedAt: now, readTopicCount: 2,
    readingElapsedMs: 1200, totalNodeCount: 5 });
  expect((await readCycleRows(peer.port)).map(row => [row.node_id, row.cohort])).toEqual([
    ['b', 'queue'], ['a', 'queue'], ['c', 'soon']]);
  const reopened = await openDailyFlow(peer.port, { now, mode: 'reading-only', seed: { ...seed,
    currentNodeId: 'c', queueNodeIds: ['c', 'a', 'b'], readTopicCount: 0 } }, settings(peer), persistence);
  expect(reopened.session).toEqual(result.session);
  await assertDurable(peer, reopened.session);
});
