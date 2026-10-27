// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { act, assertDurable, node, now, open, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

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
