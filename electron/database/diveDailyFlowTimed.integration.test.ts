// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract.js';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession.js';
import type { ReviewQueueNode } from '../../lib/core/review/queue/reviewQueuePlanner.js';
import { createInitialSchedulerCard } from '../../lib/core/review/types.js';

import { addNode, now, scheduler, setup } from './diveDailyFlow.testSupport.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);

const later = '2026-10-28T08:30:00.000Z';
type NodeReview = NonNullable<ReviewQueueNode['review']>;

function grade(session: DailyFlowSession, opId: string, rating: 'Again' | 'Good', at: string,
  before: NodeReview | null = null): DailyFlowCommitArgs {
  const nodeId = session.currentNodeId!;
  const cardBefore = before ? { ...createInitialSchedulerCard(now), due: before.due, last_review: before.lastReviewAt,
    state: before.state, stability: before.stability, difficulty: before.difficulty, elapsed_days: before.elapsedDays,
    scheduled_days: before.scheduledDays, reps: before.reps, lapses: before.lapses } : createInitialSchedulerCard(now);
  const cardAfter = scheduler.grade({ card: cardBefore, rating, now: at }).card;
  return { opId, now: at, token: session.daily!, sourceSession: session, grade: { nodeId, before,
    grade: rating === 'Again' ? 1 : 3, reviewedAt: at, schedulerVersion: 'test', cardBefore, cardAfter } };
}

// Both entrances share one selection rule: a card that became due again comes before the rest of the list.
it.each(['global', 'dive'] as const)('brings a failed card back once due in %s Flow', async entrance => {
  const { open, commit, facts, scope } = await setup('item');
  const dive = entrance === 'dive' ? scope(['topic-a', 'topic-b', 'topic-c', 'topic-d']) : undefined;
  const start = (await open(dive ? { dive } : {})).session;
  const failed = start.currentNodeId!;
  const second = (await commit(grade(start, 'fail', 'Again', now))).session;
  expect(second.currentNodeId).not.toBe(failed);
  const returned = (await commit(grade(second, 'pass', 'Good', later))).session;
  expect(returned.currentNodeId).toBe(failed);

  const reopened = (await open({ now: later, seed: returned, ...(dive ? { dive } : {}) })).session;
  expect(reopened.currentNodeId).toBe(failed);
  const remaining = (await commit(grade(reopened, 'again-pass', 'Good', later,
    (await facts()).nodesById[failed]!.review ?? null))).session;
  expect(remaining.currentNodeId).not.toBeNull();
  expect([failed, second.currentNodeId]).not.toContain(remaining.currentNodeId);
});

it('restores an undone due card in a Dive', async () => {
  const { open, commit, facts, scope } = await setup('item');
  const dive = scope(['topic-a', 'topic-b', 'topic-c', 'topic-d']);
  const start = (await open({ dive })).session;
  const failed = start.currentNodeId!;
  const second = (await commit(grade(start, 'fail', 'Again', now))).session;
  const returned = (await commit(grade(second, 'pass', 'Good', later))).session;
  expect(returned.currentNodeId).toBe(failed);
  const before = (await facts()).nodesById[failed]!.review!;
  const next = (await commit(grade(returned, 'pass-due', 'Good', later, before))).session;
  const graded = (await facts()).nodesById[failed]!.review!;
  const undo = await commit({ opId: 'undo-due', now: later, token: next.daily!, sourceSession: next,
    historyMode: 'undo', historyTargetOpId: 'pass-due', historySourceSession: next, nextSession: returned,
    reviewHistory: { nodeId: failed, before: graded, after: before, mode: 'undo', targetOpId: 'pass-due' } });
  expect(undo.session.currentNodeId).toBe(failed);
});

// A card that is due keeps its turn until it has been served, however many are due together.
it.each(['global', 'dive'] as const)('serves every card due at the same time first in %s Flow', async entrance => {
  const { open, commit, facts, scope } = await setup('item');
  const dive = entrance === 'dive' ? scope(['topic-a', 'topic-b', 'topic-c', 'topic-d']) : undefined;
  const start = (await open(dive ? { dive } : {})).session;
  const first = (await commit(grade(start, 'fail-1', 'Again', now))).session;
  const second = (await commit(grade(first, 'fail-2', 'Again', now))).session;
  const returned = (await commit(grade(second, 'pass', 'Good', later))).session;
  const failed = [start.currentNodeId!, first.currentNodeId!];
  expect(failed).toContain(returned.currentNodeId);
  const review = (await facts()).nodesById[returned.currentNodeId!]!.review!;
  const also = (await commit(grade(returned, 'pass-1', 'Good', later, review))).session;
  expect(also.currentNodeId).toBe(failed.find(id => id !== returned.currentNodeId));
});

it('keeps due cards ahead after the daily list is reconciled', async () => {
  const { peer, open, commit } = await setup('item');
  const start = (await open()).session;
  const first = (await commit(grade(start, 'fail', 'Again', now))).session;
  await open({ now: later });
  peer.db.prepare('UPDATE daily_flow_state SET invalidated = 1').run();
  await open({ now: later });
  const timed = peer.db.prepare('SELECT ready_at_ms FROM daily_flow_entry_readiness WHERE node_id = ?')
    .get(start.currentNodeId) as { ready_at_ms: number | null };
  expect(first.currentNodeId).not.toBe(start.currentNodeId);
  expect(timed.ready_at_ms).not.toBeNull();
});

it('takes a due member even when more due entries outside the Dive are waiting', async () => {
  const { peer, open, commit, scope } = await setup('item');
  const outside = Array.from({ length: 12 }, (_, index) => `outside-${index}`);
  for (const id of outside) addNode(peer, id, 9, 'item', 'topic-d');
  await open();
  const dive = scope(['topic-a', 'topic-b']);
  const timed = async (id: string, at: number) => {
    peer.db.prepare(`INSERT OR REPLACE INTO daily_flow_entry_readiness (node_id, kind, ready_at_ms)
      VALUES (?, 'review', ?)`).run(id, at);
  };
  for (const id of outside) await timed(id, Date.parse(now) - 2000);
  await timed('b', Date.parse(now) - 1000);
  const session = (await open({ dive })).session;
  expect(session.currentNodeId).toBe('b');
  expect((await commit(grade(session, 'pass-b', 'Good', now))).session.currentNodeId).toBe('a');
});

it('loads no learning facts for members that only become due later', async () => {
  const requested = new Set<string>();
  const { peer, open, commit, scope } = await setup('item', ids => ids.forEach(id => requested.add(id)));
  const members = Array.from({ length: 200 }, (_, index) => `member-${index}`);
  for (const id of members) addNode(peer, id, 9, 'item', 'topic-d');
  await open();
  peer.db.prepare('UPDATE daily_flow_entries SET initial_task = 0 WHERE node_id LIKE ?').run('member-%');
  const insert = peer.db.prepare(`INSERT OR REPLACE INTO daily_flow_entry_readiness (node_id, kind, ready_at_ms)
    VALUES (?, 'review', ?)`);
  for (const id of members) insert.run(id, Date.parse(now) + 3600_000);
  const dive = scope(['topic-d']);
  const first = (await open({ dive })).session;
  const stop = (await commit(grade(first, 'pass-d', 'Good', now))).session;
  requested.clear();
  const today = (await open({ dive, seed: stop, diveStep: 'continue' })).session;
  expect(today.currentNodeId).toBeNull();
  expect(members.filter(id => requested.has(id)).length).toBeLessThanOrEqual(32);
});
