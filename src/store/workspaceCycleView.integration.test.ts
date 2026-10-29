// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { readDailyFlowView } from '../../lib/core/flow/dailyFlowView';
import { act, node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);
const config = () => settings(peer);
const view = (includeEntries = true, stamp = now, mode: 'recommended' | 'review-first' | 'reading-only' = 'recommended') =>
  readDailyFlowView(peer.port, { now: stamp, mode, includeEntries }, config(), persistence);
const prepare = (stamp = now) => openDailyFlow(peer.port, { now: stamp, mode: 'recommended',
  prepareOnly: true, startup: true }, config(), persistence);
async function durable() {
  return { state: await readDailyFlow(peer.port), rows: await readCycleRows(peer.port), facts: await snapshot(peer),
    operations: await peer.port.query('SELECT * FROM daily_flow_operations') };
}

it('prepares a first sidebar without learning time, reads without writes, and starts time only on entry', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  expect(await view()).toEqual({ status: 'needs-preparation' });
  const prepared = await prepare();
  expect(prepared.session.sessionStartedAt).toBeNull();
  expect(prepared.session.currentItemStartedAt).toBeNull();
  expect(prepared.session.readTopicCount).toBe(0);
  const before = await durable();
  for (let index = 0; index < 3; index++) {
    const result = await view();
    expect(result).toMatchObject({ status: 'ready', complete: true, currentNodeId: prepared.session.currentNodeId });
    if (result.status === 'ready') expect(result.nodeIds).toHaveLength(2);
  }
  expect(await durable()).toEqual(before);
  const start = '2026-10-26T08:05:00.000Z';
  const entered = await openDailyFlow(peer.port, { now: start, mode: 'recommended' }, config(), persistence);
  expect(entered.session.sessionStartedAt).toBe(start);
  expect(entered.session.currentItemStartedAt).toBe(start);
  const advanced = await act(peer, entered.session, 'soon', '2026-10-26T08:05:01.000Z');
  expect(advanced.readingElapsedMs).toBe(1000);
});

it('shows every saved successor once beyond the old lap without admitting unrelated material', async () => {
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  let session = (await openDailyFlow(peer.port, { now, mode: 'reading-only' }, config(), persistence)).session;
  session = await act(peer, session, 'soon');
  node(peer, 'new-tail', 'topic');
  session = (await openDailyFlow(peer.port, { now, mode: 'reading-only' }, config(), persistence)).session;
  expect(session.cycle!.tailKey).toBeGreaterThan(session.cycle!.lapLimit);
  const before = await durable();
  const displayed = await view(true, now, 'reading-only');
  expect(displayed.status).toBe('ready');
  if (displayed.status !== 'ready') throw new Error('missing view');
  expect(displayed.nodeIds).toHaveLength(3);
  expect(displayed.nodeIds).not.toContain('new-tail');
  expect(await durable()).toEqual(before);
  const observed: string[] = [];
  for (let step = 0; step < 8 && observed.length < 3; step++) {
    if (!observed.includes(session.currentNodeId!)) observed.push(session.currentNodeId!);
    session = await act(peer, session, 'soon');
  }
  expect(displayed.nodeIds).toEqual(observed);
});

it('provides mode availability without list payload and retains sleeping and hidden rows', async () => {
  node(peer, 'reading', 'topic'); node(peer, 'review', 'item'); node(peer, 'sleeping', 'topic');
  peer.db.prepare("UPDATE nodes SET created_at=? WHERE id='sleeping'").run('2026-10-26T08:01:00.000Z');
  await prepare();
  const before = await durable();
  const summary = await view(false, now, 'review-first');
  expect(summary).toMatchObject({ status: 'ready', nodeIds: null, complete: false,
    modeAvailability: { recommended: true, 'review-first': true, 'reading-only': true } });
  const entries = await view(true, now, 'reading-only');
  if (entries.status !== 'ready') throw new Error('missing view');
  expect(entries.nodeIds).toEqual(['reading']);
  expect(await durable()).toEqual(before);
  const due = await view(true, '2026-10-26T08:02:00.000Z', 'reading-only');
  if (due.status !== 'ready') throw new Error('missing due view');
  expect(due.nodeIds).toContain('sleeping');
});

it('prepares the next day after idle without starting a new learning session', async () => {
  node(peer, 'reading', 'topic');
  const first = await prepare();
  const nextDay = '2026-10-27T08:00:00.000Z';
  expect(await view(true, nextDay)).toEqual({ status: 'needs-preparation' });
  const next = await prepare(nextDay);
  expect(next.session.daily!.dayKey).not.toBe(first.session.daily!.dayKey);
  expect(next.session.sessionStartedAt).toBeNull();
  expect(next.session.currentItemStartedAt).toBeNull();
  expect(next.session.readTopicCount).toBe(0);
  expect(await peer.port.query('SELECT * FROM daily_flow_operations')).toEqual([]);
});
