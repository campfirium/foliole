// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { readDailyFlow } from '../../lib/core/flow/dailyFlowStorage';
import type { DbParams, DbPort, DbRow } from '../../lib/core/sync/dbPort';
import { node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

let peer: Peer;
beforeEach(async () => { [peer] = await setupPeers(); });
afterEach(closeLibraries);

it('confirms Soon and its lost-receipt replay without returning display data or rereading nodes on replay', async () => {
  node(peer, 'a', 'topic'); node(peer, 'b', 'topic');
  const opened = await openDailyFlow(peer.port, { now, mode: 'reading-only' }, settings(peer), persistence);
  const source = opened.session;
  const id = source.currentNodeId!;
  const reading = (await snapshot(peer)).nodesById[id]!.reading;
  const args = { opId: 'soon-receipt', now, token: source.daily!, sourceSession: source,
    readingAction: 'soon' as const, readings: [{ nodeId: id, before: reading, after: reading }] };
  const committed = await commitDailyFlow(peer.port, args, settings(peer), persistence);
  expect(committed.session.currentNodeId).not.toBe(id);
  expect((await readDailyFlow(peer.port))?.session).toEqual(committed.session);
  expect((await snapshot(peer)).nodesById[id]!.reading).toEqual(reading);
  expect(committed).not.toHaveProperty('nodes');
  expect(committed).not.toHaveProperty('readings');
  const queries: string[] = [];
  const observe = (db: DbPort): DbPort => ({ ...db,
    query: async <R extends DbRow>(sql: string, params?: DbParams) => {
      queries.push(sql);
      return db.query<R>(sql, params);
    }, transaction: task => db.transaction(tx => task(observe(tx))) });
  const replay = await commitDailyFlow(observe(peer.port), args, settings(peer), persistence);
  expect(replay).toEqual({ ...committed, replayed: true });
  expect(queries.filter(sql => /\b(?:nodes|node_reading|node_review|readwise_sources)\b/i.test(sql))).toEqual([]);
});
