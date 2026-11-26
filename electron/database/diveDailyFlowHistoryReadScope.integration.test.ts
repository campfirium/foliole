// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { createInitialSchedulerCard } from '../../lib/core/review/types.js';

import { addNode, now, readArgs, reading, scheduler, setup } from './diveDailyFlow.testSupport.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';
import { closeLibraries } from './syncLibrary.testSupport.js';

afterEach(closeLibraries);

type Context = Awaited<ReturnType<typeof setup>>;
type Session = Awaited<ReturnType<Context['open']>>['session'];

// The learning mutation of one handled entry, with the inverse and repeat that history replays.
async function action(kind: 'topic' | 'item', context: Context, session: Session) {
  const nodeId = session.currentNodeId!;
  const base = { opId: 'handle', now, token: session.daily!, sourceSession: session };
  if (kind === 'topic') {
    return { command: { ...base, ...readArgs(nodeId), readings: [...readArgs(nodeId).readings] } as DailyFlowCommitArgs,
      replay: async () => ({ undo: { readings: [{ nodeId, before: reading, after: null }] },
        redo: { readings: [...readArgs(nodeId).readings] } }) };
  }
  const cardBefore = createInitialSchedulerCard(now);
  const cardAfter = scheduler.grade({ card: cardBefore, rating: 'Good', now }).card;
  const before = (await context.facts()).nodesById[nodeId]!.review ?? null;
  return { command: { ...base, grade: { nodeId, before, grade: 3, reviewedAt: now, schedulerVersion: 'test',
    cardBefore, cardAfter } } as DailyFlowCommitArgs,
    replay: async () => {
      const graded = (await context.facts()).nodesById[nodeId]!.review!;
      return { undo: { reviewHistory: { nodeId, before: graded, after: before, mode: 'undo' as const, targetOpId: 'handle' } },
        redo: { reviewHistory: { nodeId, before, after: graded, mode: 'redo' as const, targetOpId: 'handle' } } };
    } };
}

async function undoAndRedoReads(kind: 'topic' | 'item', entrance: 'dive' | 'global', outside: number) {
  const context = await setup(kind);
  const { peer, open, commit, scope } = context;
  for (let index = 0; index < outside; index += 1) addNode(peer, `outside-${index}`, index % 4, kind);
  const global = (await open()).session;
  const dive = entrance === 'dive' ? scope(kind === 'item' ? ['topic-b', 'topic-c'] : ['b', 'c']) : undefined;
  const start = dive ? (await open({ dive })).session : global;
  const handled = await action(kind, context, start);
  const done = await commit(handled.command);
  const replay = await handled.replay();
  const expectCounts = async () => {
    const pending = (await readCycleRows(peer.port)).filter(row => row.active && row.initial_task);
    expect((await readDailyFlow(peer.port))!.session.cycle).toMatchObject({
      remaining: pending.length, reviewRemaining: kind === 'item' ? pending.length : 0 });
  };
  const undo = await measureSqlStatements(() => commit({ opId: 'undo', now, token: done.session.daily!,
    historyMode: 'undo', historyTargetOpId: 'handle', sourceSession: done.session, historySourceSession: done.session,
    nextSession: start, ...replay.undo }));
  expect(undo.result.session.currentNodeId).toBe(start.currentNodeId);
  await expectCounts();
  const redo = await measureSqlStatements(() => commit({ opId: 'redo', now, token: undo.result.session.daily!,
    historyMode: 'redo', historyTargetOpId: 'handle', sourceSession: undo.result.session, historySourceSession: start,
    nextSession: done.session, ...replay.redo }));
  expect(redo.result.session.currentNodeId).toBe(done.session.currentNodeId);
  await expectCounts();
  await closeLibraries();
  return { undo: undo.report.rowsRead, redo: redo.report.rowsRead };
}

it.each([['topic', 'dive'], ['topic', 'global'], ['item', 'dive'], ['item', 'global']] as const)(
  'undoes and redoes a %s in %s Flow without reading unrelated entries', async (kind, entrance) => {
    const small = await undoAndRedoReads(kind, entrance, 200);
    const large = await undoAndRedoReads(kind, entrance, 600);
    expect(large).toEqual(small);
  });

it('reaches the day\'s Flow facts without walking earlier days on undo', async () => {
  const context = await setup('topic');
  const { peer, open, commit } = context;
  const plans: string[] = [];
  const prepare = peer.db.prepare.bind(peer.db);
  peer.db.prepare = ((sql: string) => {
    // The latest-time lookup walks the time index from its newest end and stops at today's first fact.
    if (/FROM daily_flow_sync_facts/u.test(sql) && /day_end\s*>\s*\?/u.test(sql) && !sql.includes('MAX(')) {
      plans.push(...(prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array.from(sql.matchAll(/\?/gu), () => null)) as
        { detail: string }[]).map(row => row.detail));
    }
    return prepare(sql);
  }) as typeof peer.db.prepare;
  const start = (await open()).session;
  const handled = await action('topic', context, start);
  const done = await commit(handled.command);
  const replay = await handled.replay();
  await commit({ opId: 'undo', now, token: done.session.daily!, historyMode: 'undo', historyTargetOpId: 'handle',
    sourceSession: done.session, historySourceSession: done.session, nextSession: start, ...replay.undo });
  expect(plans.length).toBeGreaterThan(0);
  expect(plans.filter(detail => /^SCAN daily_flow_sync_facts|daily_flow_action_time/u.test(detail))).toEqual([]);
});
