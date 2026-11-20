// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { act, node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

function observed() {
  const reads: string[][] = [];
  return { reads, persistence: { ...persistence,
    learningSnapshot: (db: Parameters<typeof persistence.learningSnapshot>[0], ids?: readonly string[]) => {
      if (ids) reads.push([...ids]);
      return persistence.learningSnapshot(db, ids);
    } } };
}

type Peer = Awaited<ReturnType<typeof setupPeers>>[number];

async function soon(peer: Peer, session: DailyFlowSession, flow: typeof persistence) {
  const id = session.currentNodeId!;
  const reading = (await snapshot(peer)).nodesById[id]!.reading;
  return (await commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now, token: session.daily!, sourceSession: session,
    readingAction: 'soon', readings: [{ nodeId: id, before: reading, after: reading }] }, settings(peer), flow)).session;
}

it('does not read rows hidden by the current mode when choosing the next card', async () => {
  const [peer] = await setupPeers();
  for (let index = 0; index < 300; index += 1) node(peer, `item-${String(index).padStart(3, '0')}`, 'item');
  for (const id of ['topic-a', 'topic-b', 'topic-c']) node(peer, id, 'topic');
  const watch = observed();
  let session = (await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), watch.persistence)).session;
  const topics = new Set(['topic-a', 'topic-b', 'topic-c']);
  for (let step = 0; step < 6; step += 1) {
    expect(topics.has(session.currentNodeId!)).toBe(true);
    watch.reads.length = 0;
    session = await soon(peer, session, watch.persistence);
    const itemReads = watch.reads.flat().filter(id => id.startsWith('item-')).length;
    // The list holds 300 review cards; a reading-only pick must not pull them out to judge them.
    expect(itemReads).toBeLessThanOrEqual(8);
  }
});

it('takes a same-day relearning card first once its time arrives', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) node(peer, id, 'item', null, true);
  let session = (await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence)).session;
  const failed = session.currentNodeId!;
  session = await act(peer, session, 'grade', now, settings(peer), 1);
  const due = (await snapshot(peer)).nodesById[failed]!.review!.due;
  expect(Date.parse(due)).toBeGreaterThan(Date.parse(now));
  expect(session.currentNodeId).not.toBe(failed);
  const later = new Date(Date.parse(due) + 1000).toISOString();
  session = await act(peer, session, 'grade', later, settings(peer), 3);
  expect(session.currentNodeId).toBe(failed);
  expect(session.cycle!.timedResume).toBeDefined();
  // The resume cursor belongs to this device and never enters shared operation records.
  const payloads = peer.db.prepare('SELECT payload_json FROM daily_flow_sync_facts').pluck().all() as string[];
  expect(payloads.length).toBeGreaterThan(0);
  expect(payloads.some(payload => payload.includes('timedResume'))).toBe(false);
  session = await act(peer, session, 'grade', later, settings(peer), 3);
  expect(session.currentNodeId).not.toBe(failed);
});
