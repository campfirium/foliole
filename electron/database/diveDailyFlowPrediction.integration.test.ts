// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import { createInitialSchedulerCard } from '../../lib/core/review/types.js';

import { now, readArgs, scheduler, setup } from './diveDailyFlow.testSupport.js';
import { closeRequestSyncReadonlyConnections } from './requestSyncReadonlySnapshot.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(async () => { closeRequestSyncReadonlyConnections(); await closeLibraries(); });

const later = '2026-10-28T08:30:00.000Z';

function grade(session: DailyFlowSession, opId: string, rating: 'Again' | 'Good', at: string): DailyFlowCommitArgs {
  const cardBefore = createInitialSchedulerCard(now);
  return { opId, now: at, token: session.daily!, sourceSession: session, grade: { nodeId: session.currentNodeId!,
    before: null, grade: rating === 'Again' ? 1 : 3, reviewedAt: at, schedulerVersion: 'test', cardBefore,
    cardAfter: scheduler.grade({ card: cardBefore, rating, now: at }).card } };
}

const rows = (peer: Awaited<ReturnType<typeof setup>>['peer']) => peer.db.prepare(`SELECT e.*, r.ready_at_ms
  FROM daily_flow_entries e LEFT JOIN daily_flow_entry_readiness r USING (node_id) ORDER BY e.node_id`).all();

// The prepared body is only useful when it is the one the next commit shows.
it('predicts the Dive successor a commit then shows, including a card that became due, without writing', async () => {
  const { peer, open, commit, predict, scope } = await setup('item');
  peer.db.pragma('journal_mode = WAL');
  const dive = scope(['topic-a', 'topic-b', 'topic-c', 'topic-d']);
  const first = (await open({ dive })).session;
  const before = rows(peer);
  const expected = await predict(first);
  expect(rows(peer)).toEqual(before);
  const second = (await commit(grade(first, 'fail', 'Again', now))).session;
  expect(second.currentNodeId).toBe(expected);

  const due = await predict(second, later);
  expect(due).toBe(first.currentNodeId);
  const returned = (await commit(grade(second, 'pass', 'Good', later))).session;
  expect(returned.currentNodeId).toBe(due);
  // A due card on screen still waits in the time queue; it is not its own successor.
  expect(await predict(returned, later)).not.toBe(returned.currentNodeId);
});

it('predicts the next unread Topic of the last Dive stage', async () => {
  const { peer, open, commit, predict, scope } = await setup('topic');
  peer.db.pragma('journal_mode = WAL');
  const dive = scope(['a', 'b', 'c']);
  let session = (await open({ dive })).session;
  peer.db.prepare('UPDATE daily_flow_entries SET active = 0').run();
  for (let stage = 0; stage < 3 && session.dive!.phase !== 'topics'; stage += 1) {
    session = (await open({ dive, seed: { ...session, currentNodeId: null,
      dive: { ...session.dive!, stop: 'empty' } }, diveStep: 'continue' })).session;
  }
  expect(session.dive!.phase).toBe('topics');
  const expected = await predict(session);
  expect(expected).toBeTruthy();
  expect(expected).not.toBe(session.currentNodeId);
  const next = (await commit({ opId: 'read', now, token: session.daily!, sourceSession: session,
    readingAction: 'read', readings: [...readArgs(session.currentNodeId!).readings] })).session;
  expect(next.currentNodeId).toBe(expected);
});
