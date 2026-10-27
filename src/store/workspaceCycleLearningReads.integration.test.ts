// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readCompanionReviewTopic } from '../companion/companionReadingReview';
import { assertDurable, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it.each(['soon', 'read'] as const)('reads unchanged learning facts once while preserving %s receipts', async action => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const config = settings(peer);
  const session = await open(peer, now, config, 'reading-only');
  const id = session.currentNodeId!;
  const before = await snapshot(peer);
  const reading = before.nodesById[id]!.reading;
  const after = action === 'read'
    ? readCompanionReviewTopic({ snapshot: before, nodeId: id, now })!.snapshot.nodesById[id]!.reading : reading;
  const reads: string[][] = [];
  const result = await commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now,
    token: session.daily!, sourceSession: session, readingAction: action,
    readings: [{ nodeId: id, before: reading, after }] }, config, { ...persistence,
    snapshot: async (db, ids) => {
      reads.push([...(ids ?? [])]);
      return persistence.snapshot(db, ids);
    } });
  expect(reads.filter(ids => ids.length === 1 && ids[0] === id)).toHaveLength(action === 'soon' ? 1 : 2);
  const persisted = await snapshot(peer);
  expect(persisted.nodesById[id]!.reading).toEqual(after);
  expect(result.readings).toEqual([{ nodeId: id, reading: after ?? null }]);
  expect(result.nodes![id]!.reading).toEqual(after);
  expect(result.session.currentNodeId).not.toBe(id);
  await assertDurable(peer, result.session);
});
