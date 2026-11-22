// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import { readDailyFlowView } from '../../lib/core/flow/dailyFlowView';
import { act, node, now, open, persistence, settings, setupPeers } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

async function view(stamp: string) {
  const result = await readDailyFlowView(peer.port, { now: stamp, mode: 'review-first', includeEntries: false },
    settings(peer), persistence);
  if (result.status !== 'ready') throw new Error('test_flow_view_not_ready');
  return result;
}
const shift = (stamp: string, ms: number) => new Date(Date.parse(stamp) + ms).toISOString();

it('names the instant a waiting review falls due, and the view only changes there', async () => {
  node(peer, 'card', 'item', null, true);
  const session = await open(peer, now, settings(peer), 'review-first');
  expect(session.currentNodeId).toBe('card');
  await act(peer, session, 'grade', now, settings(peer), 1);

  const waiting = await view(now);
  expect(waiting.modeAvailability['review-first']).toBe(false);
  const changeAt = waiting.nextChangeAt!;
  const dayEnd = (await readDailyFlow(peer.port))!.session.dayWindow!.end;
  expect(Date.parse(changeAt)).toBeGreaterThan(Date.parse(now));
  expect(Date.parse(changeAt)).toBeLessThan(Date.parse(dayEnd));

  const justBefore = await view(shift(changeAt, -1_000));
  expect(justBefore.modeAvailability).toEqual(waiting.modeAvailability);
  expect(justBefore.nextChangeAt).toBe(changeAt);
  expect((await view(changeAt)).modeAvailability['review-first']).toBe(true);
});

it('falls back to the end of the Flow day when nothing is waiting', async () => {
  node(peer, 'topic', 'topic');
  await open(peer);
  const ready = await view(now);
  expect(ready.nextChangeAt).toBe((await readDailyFlow(peer.port))!.session.dayWindow!.end);
});
