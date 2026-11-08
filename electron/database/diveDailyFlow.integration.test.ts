// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import { applyReviewGrade } from '../../lib/core/database/reviewMutations.js';
import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract.js';
import { loadDailyFlowLearningSnapshot } from '../../lib/core/flow/dailyFlowLearningSnapshot.js';
import { commitDailyFlow, openDailyFlow, type DailyFlowPersistence } from '../../lib/core/flow/dailyFlowService.js';
import { readCycleRows, readDailyFlow } from '../../lib/core/flow/dailyFlowStorage.js';
import { createFsrsReviewScheduler } from '../../lib/core/review/fsrsScheduler.js';
import { createReviewSchedulerParameters, DEFAULT_REVIEW_SCHEDULER_SETTINGS, getReviewSchedulerVersion } from '../../lib/core/review/settings.js';
import { createInitialSchedulerCard } from '../../lib/core/review/types.js';

import { createDive } from './diveRepository.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

const now = '2026-10-28T08:00:00.000Z';
const tomorrow = '2026-10-29T08:00:00.000Z';
const schedulerSettings = DEFAULT_REVIEW_SCHEDULER_SETTINGS;
const scheduler = createFsrsReviewScheduler({ loadSettings: () => schedulerSettings,
  getSettingsVersion: getReviewSchedulerVersion, createParameters: createReviewSchedulerParameters });

afterEach(closeLibraries);

function addNode(peer: Peer, id: string, priority: number, kind: 'topic' | 'item', parent: string | null = null) {
  peer.db.prepare(`INSERT INTO nodes (id, parent_id, kind, priority, title, content, reveal, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', ?)`)
    .run(id, parent, kind, priority, id, `Prompt ${id}`, kind === 'item' ? 'Answer' : null, now);

}

async function setup(kind: 'topic' | 'item') {
  await startLibraries();
  const peer = createPeer('desktop');
  for (const [index, id] of ['a', 'b', 'c', 'd'].entries()) {
    if (kind === 'item') addNode(peer, `topic-${id}`, index, 'topic');
    addNode(peer, id, index, kind, kind === 'item' ? `topic-${id}` : null);
  }
  const settings = { scope: peer.file, newDayStartsAtHour: 4, pushQueue: schedulerSettings.pushQueue };
  const persistence: DailyFlowPersistence = {
    learningSnapshot: (db, ids) => loadDailyFlowLearningSnapshot(db, 'desktop', ids),
    snapshot: async () => { throw new Error('Expected scoped learning facts'); },
    grade: async (_db, value, opId) => applyReviewGrade(peer.driver, { ...value, opId },
      { hostName: peer.name, createId: () => `${opId}-log` }),
    reading: async (_db, value, updatedAt) => { saveNodeReadingStateWithSync(peer.driver,
      { nodeId: value.nodeId, reading: value.after, updatedAt, hostName: peer.name }); },
    reviewHistory: async (_db, value, updatedAt) => saveNodeReviewStateWithSync(peer.driver,
      { nodeId: value.nodeId, review: value.after, updatedAt, hostName: peer.name,
        history: { mode: value.mode, targetOpId: value.targetOpId } })
  };
  const mode = kind === 'item' ? 'review-first' : 'reading-only';
  return { peer, mode, scope: (topicIds: string[]) => ({ id: createDive(peer.db, 'Test Dive', topicIds).id, topicIds }),
    facts: () => persistence.learningSnapshot(peer.port),
    open: (overrides: Partial<Parameters<typeof openDailyFlow>[1]> = {}) =>
      openDailyFlow(peer.port, { now, mode, ...overrides }, settings, persistence),
    commit: (command: DailyFlowCommitArgs) => commitDailyFlow(peer.port, command, settings, persistence) };
}

const reading = { intervalDurationMs: 86400000, intervalGrowthFactor: 2, lastHandledAt: now,
  nextAt: tomorrow, priority: 1, readingPosition: 0, repetitionCount: 1, state: 'active' } as const;

function readArgs(nodeId: string) {
  return { readingAction: 'read', readings: [{ nodeId, before: null, after: reading }] } as const;
}

it('reads and undoes/redoes within a dive without moving the global position', async () => {
  const { peer, open, commit, facts, scope } = await setup('topic');
  const global = (await open()).session;
  expect(global.currentNodeId).toBe('a');
  const rows = await readCycleRows(peer.port);
  const [, first, middle, last] = rows.map(row => row.node_id) as [string, string, string, string];
  const group = scope([last, first]);
  const dive = (await open({ dive: group })).session;
  expect(dive.currentNodeId).toBe(first);
  expect((await readDailyFlow(peer.port))!.session).toEqual(global);
  const command: DailyFlowCommitArgs = { opId: 'read-b', now, token: dive.daily!, sourceSession: dive,
    ...readArgs(first), readings: [...readArgs(first).readings] };
  const result = await commit(command);
  expect(result.session.currentNodeId).toBe(last);
  const persisted = (await readDailyFlow(peer.port))!.session;
  expect(persisted).toMatchObject({ currentNodeId: 'a', readTopicCount: 1 });
  expect(persisted.cycle).toMatchObject({ scanAfter: global.cycle!.scanAfter, clearKey: global.cycle!.clearKey,
    lapLimit: global.cycle!.lapLimit, clearedAt: null });
  expect((await readCycleRows(peer.port)).filter(row => row.node_id !== first)).toEqual(rows.filter(row => row.node_id !== first));
  expect(await commit(command)).toMatchObject({ replayed: true, session: { currentNodeId: last } });
  expect((await open({ dive: group, seed: result.session })).session.currentNodeId).toBe(last);
  await expect(commit({ ...command, readings: [{ nodeId: first, before: null, after: null }] }))
    .rejects.toThrow('daily_flow_operation_mismatch');
  await expect(commit({ ...command, opId: 'duplicate-read' })).rejects.toThrow('daily_flow_changed');
  await expect(commit({ ...command, now: tomorrow })).rejects.toThrow('daily_flow_changed');
  const undo = await commit({ opId: 'undo-b', now, token: result.session.daily!, historyMode: 'undo',
    historyTargetOpId: command.opId, sourceSession: result.session, historySourceSession: result.session,
    nextSession: dive, readings: [{ nodeId: first, before: reading, after: null }] });
  expect(undo.session.currentNodeId).toBe(first);
  expect((await facts()).nodesById[first]!.reading).toBeNull();
  expect((await readDailyFlow(peer.port))!.session).toMatchObject({ currentNodeId: 'a', readTopicCount: 0 });
  const redo = await commit({ opId: 'redo-b', now, token: undo.session.daily!, historyMode: 'redo',
    historyTargetOpId: command.opId, sourceSession: undo.session, historySourceSession: dive,
    nextSession: result.session, readings: [...readArgs(first).readings] });
  expect(redo.session.currentNodeId).toBe(last);
  const resumed = (await open({ returnFromDive: true })).session;
  expect(resumed).toMatchObject({ currentNodeId: 'a', readTopicCount: 1 });
  const next = await commit({ opId: 'read-a', now, token: resumed.daily!, sourceSession: resumed,
    ...readArgs('a'), readings: [...readArgs('a').readings] });
  expect(next.session.currentNodeId).toBe(middle);
  const nextDay = (await open({ now: tomorrow })).session;
  await expect(commit(command)).rejects.toThrow('daily_flow_changed');
  expect((await readDailyFlow(peer.port))!.session).toEqual(nextDay);
  const reopened = new Database(peer.file, { readonly: true });
  try {
    expect(reopened.prepare("SELECT repetition_count FROM node_reading WHERE node_id=?").get(first))
      .toEqual({ repetition_count: 1 });
  } finally { reopened.close(); }
});

it('grades the global current item within a dive and revalidates that slot on return', async () => {
  const { peer, open, commit, facts, scope } = await setup('item');
  const global = (await open()).session;
  expect(global.currentNodeId).toBe('a');
  const dive = (await open({ dive: scope(['topic-c', 'topic-a']) })).session;
  expect(dive.currentNodeId).toBe('a');
  const before = (await facts()).nodesById.a!.review ?? null;
  const cardBefore = createInitialSchedulerCard(now);
  const cardAfter = scheduler.grade({ card: cardBefore, rating: 'Good', now }).card;
  const command: DailyFlowCommitArgs = { opId: 'grade-a', now, token: dive.daily!, sourceSession: dive,
    grade: { nodeId: 'a', before, grade: 3, reviewedAt: now, schedulerVersion: 'test', cardBefore, cardAfter } };
  const result = await commit(command);
  expect(result.session.currentNodeId).toBe('c');
  expect(await commit(command)).toMatchObject({ replayed: true, session: { currentNodeId: 'c' } });
  expect((await readDailyFlow(peer.port))!.session.currentNodeId).toBe('a');
  const graded = (await facts()).nodesById.a!.review ?? null;
  expect(graded?.reps).toBe(1);
  expect((await readDailyFlow(peer.port))!.session.reviewedItemCount).toBe(1);
  const undo = await commit({ opId: 'undo-grade-a', now, token: result.session.daily!, historyMode: 'undo',
    historyTargetOpId: command.opId, sourceSession: result.session, historySourceSession: result.session,
    nextSession: dive, reviewHistory: { nodeId: 'a', before: graded, after: before, mode: 'undo', targetOpId: command.opId } });
  expect(undo.session.currentNodeId).toBe('a');
  expect((await facts()).nodesById.a!.review).toEqual(before);
  expect((await readDailyFlow(peer.port))!.session.reviewedItemCount).toBe(0);
  const redo = await commit({ opId: 'redo-grade-a', now, token: undo.session.daily!, historyMode: 'redo',
    historyTargetOpId: command.opId, sourceSession: undo.session, historySourceSession: dive,
    nextSession: result.session, reviewHistory: { nodeId: 'a', before, after: graded, mode: 'redo', targetOpId: command.opId } });
  expect(redo.session.currentNodeId).toBe('c');
  expect((await readDailyFlow(peer.port))!.session.currentNodeId).toBe('a');
  const nextGlobal = (await readCycleRows(peer.port)).find(row => row.active && row.order_key > global.cycle!.scanAfter && row.node_id !== 'a');
  expect((await open({ returnFromDive: true })).session).toMatchObject({ currentNodeId: nextGlobal?.node_id, reviewedItemCount: 1 });
  const reopened = new Database(peer.file, { readonly: true });
  try {
    expect(reopened.prepare("SELECT reps FROM node_review WHERE node_id='a'").get()).toEqual({ reps: 1 });
    expect(reopened.prepare("SELECT COUNT(*) AS count FROM review_log WHERE op_id='grade-a'").get()).toEqual({ count: 1 });
  } finally { reopened.close(); }
});

it('returns to the next global slot when a still-ready Topic moved to the tail', async () => {
  const { peer, open, commit, scope } = await setup('topic');
  const global = (await open()).session;
  const next = (await readCycleRows(peer.port)).find(row => row.order_key > global.cycle!.scanAfter)!;
  const dive = (await open({ dive: scope(['a']) })).session;
  await commit({ opId: 'read-ready', now, token: dive.daily!, sourceSession: dive,
    readingAction: 'read', readings: [{ nodeId: 'a', before: null, after: { ...reading, nextAt: now } }] });
  expect((await readCycleRows(peer.port)).find(row => row.node_id === 'a')).toMatchObject({ active: 1, initial_task: 0 });
  expect((await open({ returnFromDive: true })).session.currentNodeId).toBe(next.node_id);
});

it('keeps the current Dive open when undoing and redoing another Dive’s Read', async () => {
  const { open, commit, facts, scope } = await setup('topic');
  const first = (await open({ dive: scope(['b']) })).session;
  const read = await commit({ opId: 'read-first', now, token: first.daily!, sourceSession: first,
    readingAction: 'read', readings: [...readArgs('b').readings] });
  const other = scope(['c']);
  const second = (await open({ dive: other })).session;
  const undo = await commit({ opId: 'undo-first', now, token: second.daily!, sourceSession: second,
    historyMode: 'undo', historyTargetOpId: 'read-first', historySourceSession: read.session, nextSession: first,
    readings: [{ nodeId: 'b', before: reading, after: null }] });
  expect(undo.session).toMatchObject({ dive: { id: other.id }, currentNodeId: 'c' });
  expect((await facts()).nodesById.b!.reading).toBeNull();
  const redo = await commit({ opId: 'redo-first', now, token: undo.session.daily!, sourceSession: undo.session,
    historyMode: 'redo', historyTargetOpId: 'read-first', historySourceSession: first, nextSession: read.session,
    readings: [...readArgs('b').readings] });
  expect(redo.session).toMatchObject({ dive: { id: other.id }, currentNodeId: 'c' });
  expect((await facts()).nodesById.b!.reading).toMatchObject({ repetitionCount: 1 });
});

it('pauses at each choice and keeps the round boundary and scheduled Topic positions', async () => {
  const { peer, open, commit, facts, scope } = await setup('topic');
  const later = '2026-10-28T09:00:00.000Z';
  const future = '2026-10-28T10:00:00.000Z';
  addNode(peer, 'item-b', 5, 'item', 'b');
  saveNodeReviewStateWithSync(peer.driver, { nodeId: 'item-b', updatedAt: now, hostName: peer.name, review: {
    due: later, lastReviewAt: now, state: 1, stability: 1, difficulty: 5, elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0
  } });
  const scheduled = { ...reading, nextAt: later };
  saveNodeReadingStateWithSync(peer.driver, { nodeId: 'c', reading: scheduled, updatedAt: now, hostName: peer.name });
  const global = (await open()).session;
  const dive = scope(['b', 'c']);
  const mode = 'recommended';
  const start = (await open({ dive, mode })).session;
  expect(start).toMatchObject({ currentNodeId: 'b', dive: { phase: 'initial', stop: null } });
  const read = async (source: typeof start, at: string, nextAt: string) => {
    const nodeId = source.currentNodeId!;
    return (await commit({ opId: `read-${source.dive!.phase}-${source.daily!.revision}`, now: at, token: source.daily!,
      sourceSession: source, readingAction: 'read', readings: [{ nodeId,
        before: (await facts()).nodesById[nodeId]!.reading ?? null, after: { ...reading, nextAt, lastHandledAt: at } }] })).session;
  };
  const advance = async (seed: typeof start, at = now) =>
    (await open({ dive, mode, seed, now: at, diveStep: 'continue' })).session;
  const initialStop = await read(start, now, now);
  expect(initialStop).toMatchObject({ currentNodeId: null, dive: { phase: 'initial', stop: 'finished' } });
  const today = await advance(initialStop);
  expect(today).toMatchObject({ currentNodeId: 'b', dive: { phase: 'today' } });
  const todayStop = await read(today, now, now);
  expect(todayStop).toMatchObject({ currentNodeId: null, dive: { phase: 'today', stop: 'waiting', limit: today.dive!.limit } });
  expect(todayStop.cycle!.tailKey).toBeGreaterThan(today.dive!.limit);
  const cPosition = (await readCycleRows(peer.port)).find(row => row.node_id === 'c')!.order_key;
  const topics = await advance(todayStop);
  expect(topics).toMatchObject({ currentNodeId: 'b', dive: { phase: 'topics' } });
  const topicsStop = await read(topics, now, future);
  expect(topicsStop).toMatchObject({ currentNodeId: null, dive: { phase: 'topics', stop: 'waiting' } });
  expect((await readCycleRows(peer.port)).find(row => row.node_id === 'c')!.order_key).toBe(cPosition);
  const nextRound = await advance(topicsStop, later);
  expect(nextRound).toMatchObject({ currentNodeId: 'c', dive: { phase: 'topics', position: cPosition } });
  expect((await facts()).nodesById.b!.reading?.nextAt).toBe(future);
  const finalStop = await read(nextRound, later, tomorrow);
  expect(finalStop).toMatchObject({ currentNodeId: null, dive: { phase: 'topics', stop: 'waiting' } });
  expect((await facts()).nodesById['item-b']!.review?.reps).toBe(1);
  const empty = scope([]);
  const switched = (await open({ dive: empty, seed: finalStop, now: later })).session;
  expect(switched).toMatchObject({ currentNodeId: null, dive: { id: empty.id, phase: 'initial', stop: 'empty' } });
  expect((await open({ returnFromDive: true, now: later })).session.currentNodeId).toBe(global.currentNodeId);
});
