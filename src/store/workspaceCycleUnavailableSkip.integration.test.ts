// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

function observed() {
  const scanned: string[][] = [];
  return { scanned, persistence: { ...persistence,
    learningSnapshot: (db: Parameters<typeof persistence.learningSnapshot>[0], ids?: readonly string[]) => {
      if (ids) scanned.push([...ids]);
      return persistence.learningSnapshot(db, ids);
    } } };
}

async function soon(peer: Awaited<ReturnType<typeof setupPeers>>[number], session: DailyFlowSession, flow: typeof persistence) {
  const id = session.currentNodeId!;
  const reading = (await snapshot(peer)).nodesById[id]!.reading;
  return (await commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now, token: session.daily!, sourceSession: session,
    readingAction: 'soon', readings: [{ nodeId: id, before: reading, after: reading }] }, settings(peer), flow)).session;
}

it('retires unavailable cycle rows on their first skip and readmits them through reconcile once available again', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c', 'd', 'e']) node(peer, id, 'topic');
  const watch = observed();
  let session = (await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), watch.persistence)).session;
  const shown = session.currentNodeId!;
  const [trashed, emptied] = ['a', 'b', 'c', 'd', 'e'].filter(id => id !== shown);
  peer.db.prepare("UPDATE nodes SET deleted_at='2026-10-26T07:00:00.000Z' WHERE id=?").run(trashed);
  peer.db.prepare("UPDATE nodes SET content='', body_blob_hash=NULL WHERE id=?").run(emptied);
  expect((await readDailyFlow(peer.port))!.invalidated).toBe(0);

  const visited: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    session = await soon(peer, session, watch.persistence);
    visited.push(session.currentNodeId!);
  }
  expect(visited).not.toContain(trashed);
  expect(visited).not.toContain(emptied);
  const rows = new Map((await readCycleRows(peer.port)).map(row => [row.node_id, row]));
  expect(rows.get(trashed)).toMatchObject({ active: 0, initial_task: 0 });
  expect(rows.get(emptied)).toMatchObject({ active: 0, initial_task: 0 });
  // Several laps pass over the retired positions; only the first pass may still read them.
  const passes = (id: string) => watch.scanned.filter(ids => ids.includes(id)).length;
  expect(passes(trashed)).toBeLessThanOrEqual(1);
  expect(passes(emptied)).toBeLessThanOrEqual(1);

  peer.db.prepare('UPDATE nodes SET deleted_at=NULL WHERE id=?').run(trashed);
  peer.db.prepare("UPDATE nodes SET content='Arrived body' WHERE id=?").run(emptied);
  peer.db.prepare('UPDATE daily_flow_state SET invalidated=1 WHERE id=1').run();
  const reconciled = new Map((await (async () => {
    await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence);
    return readCycleRows(peer.port);
  })()).map(row => [row.node_id, row]));
  expect(reconciled.get(trashed)).toMatchObject({ active: 1 });
  expect(reconciled.get(emptied)).toMatchObject({ active: 1 });
  session = (await readDailyFlow(peer.port))!.session;
  const returned: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    session = await soon(peer, session, persistence);
    returned.push(session.currentNodeId!);
  }
  expect(returned).toEqual(expect.arrayContaining([trashed, emptied]));
});
