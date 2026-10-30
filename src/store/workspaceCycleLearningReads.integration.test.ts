// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { closeLibraries } from '../../electron/database/syncLibrary.testSupport';
import { scopedDailyLearningSnapshot } from '../../lib/core/flow/dailyFlowGrade';
import { commitDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { transactionDailyFlowPersistence } from '../../lib/core/flow/dailyFlowTransactionFacts';
import { readCompanionReviewTopic } from '../companion/companionReadingReview';
import { assertDurable, node, now, open, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

afterEach(closeLibraries);

it.each(['soon', 'read'] as const)('reads unchanged learning facts once while persisting %s results', async action => {
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
    learningSnapshot: async (db, ids) => {
      reads.push([...(ids ?? [])]);
      return persistence.learningSnapshot(db, ids);
    } });
  expect(reads.filter(ids => ids.includes(id))).toHaveLength(1);
  const ids = reads.flat();
  expect(ids).toHaveLength(new Set(ids).size);
  const persisted = await snapshot(peer);
  expect(persisted.nodesById[id]!.reading).toEqual(after);
  if (action === 'read') expect(result.readings).toEqual([{ nodeId: id, reading: after ?? null }]);
  expect(result.session.currentNodeId).not.toBe(id);
  await assertDurable(peer, result.session);
});

it('checks externally changed learning facts again in the next transaction', async () => {
  const [peer] = await setupPeers();
  for (const id of ['a', 'b', 'c']) node(peer, id, 'topic');
  const config = settings(peer);
  const initial = await open(peer, now, config, 'reading-only');
  const current = initial.currentNodeId!;
  const first = await commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now,
    token: initial.daily!, sourceSession: initial, readingAction: 'soon',
    readings: [{ nodeId: current, before: null, after: null }] }, config, persistence);
  const next = first.session.currentNodeId!;
  const changed = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now,
    nextAt: now, priority: 10, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
  await persistence.reading(peer.port, { nodeId: next, before: null, after: changed }, now);
  await expect(commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now,
    token: first.session.daily!, sourceSession: first.session, readingAction: 'soon',
    readings: [{ nodeId: next, before: null, after: null }] }, config, persistence))
    .rejects.toThrow('daily_flow_learning_changed');
  expect((await snapshot(peer)).nodesById[next]!.reading).toEqual(changed);
  expect(peer.db.prepare('SELECT * FROM daily_flow_operations').all()).toHaveLength(1);
});

it('returns every requested ancestor even when a deep hierarchy exceeds retained facts', async () => {
  const [peer] = await setupPeers();
  for (let index = 0; index < 140; index++) {
    node(peer, `folder-${index}`, 'folder', index ? `folder-${index - 1}` : null);
  }
  node(peer, 'article', 'topic', 'folder-139');
  const config = settings(peer);
  const session = await open(peer, now, config, 'reading-only');
  expect(session.currentNodeId).toBe('article');
  const result = await commitDailyFlow(peer.port, { opId: crypto.randomUUID(), now,
    token: session.daily!, sourceSession: session, readingAction: 'soon',
    readings: [{ nodeId: 'article', before: null, after: null }] }, config, persistence);
  const facts = await peer.port.transaction(db => scopedDailyLearningSnapshot(db, transactionDailyFlowPersistence(persistence), ['article']));
  expect(Object.keys(facts.nodesById)).toHaveLength(141);
  expect(facts.nodesById['folder-0']?.kind).toBe('folder');
  expect(facts.nodesById.article?.parentNodeId).toBe('folder-139');
  expect(result.session.currentNodeId).toBe('article');
  await assertDurable(peer, result.session);
});
