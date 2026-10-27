// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';
import { legacyContinuation } from '../test/dailyFlowLegacyContinuation.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('confirms Soon and its lost-receipt replay with only learning fields and without display/source reads on replay', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const opened = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), persistence);
  const source = opened.session;
  const id = source.currentNodeId!;
  const reading = (await snapshot(peer)).nodesById[id]!.reading;
  const args = { opId: 'soon-receipt', now, token: source.daily!, sourceSession: source,
    readingAction: 'soon' as const, readings: [{ nodeId: id, before: reading, after: reading }] };
  const queries: string[] = [];
  const observe = (db: DbPort): DbPort => ({ ...db,
    query: async <R extends DbRow>(sql: string, params?: DbParams) => {
      queries.push(sql);
      return db.query<R>(sql, params);
    }, transaction: task => db.transaction(tx => task(observe(tx))) });
  const committed = await commitDailyFlow(observe(peer.port), args, settings(peer), persistence);
  expect(committed.session.currentNodeId).not.toBe(id);
  expect((await readDailyFlow(peer.port))?.session).toEqual(committed.session);
  expect((await snapshot(peer)).nodesById[id]!.reading).toEqual(reading);
  expect(committed).not.toHaveProperty('nodes');
  expect(committed).not.toHaveProperty('readings');
  const replay = await commitDailyFlow(observe(peer.port), args, settings(peer), persistence);
  expect(replay).toEqual({ ...committed, replayed: true });
  expect(queries.filter(sql => /\b(?:readwise_sources|attachments|collections)\b|SELECT\s+n\.\*/i.test(sql))).toEqual([]);
  expect(Object.keys(replay.learning ?? {})).toEqual([replay.session.currentNodeId]);
  expect(Object.keys(Object.values(replay.learning!)[0]!).sort()).toEqual(['reading', 'review']);
});


it('opens and continues a saved Flow with minimal confirmations', async () => {
  node(peer, 'reading', 'topic');
  const opened = await openDailyFlow(peer.port, { now, mode: 'recommended' }, settings(peer), persistence);
  expect(opened).not.toHaveProperty('nodes');
  const source = await legacyContinuation(peer.port, { ...opened.session, reviewedItemCount: 1 }, now);
  const args = { opId: 'continue-receipt', now, token: source.daily!,
    navigation: 'continue-reading' as const, expectedContinueNodeId: source.continueNodeId! };
  const continued = await commitDailyFlow(peer.port, args, settings(peer), persistence);
  expect(continued.session.currentNodeId).toBe('reading');
  expect(continued).not.toHaveProperty('nodes');
  expect(continued).not.toHaveProperty('readings');
  expect(continued).not.toHaveProperty('card');
  const retry = await commitDailyFlow(peer.port, args, settings(peer), persistence);
  expect(retry).toEqual({ ...continued, replayed: true });
});
