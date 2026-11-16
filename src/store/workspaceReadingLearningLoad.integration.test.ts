// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { closeLibraries, type Peer } from '../../electron/database/syncLibrary.testSupport';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import { commitDailyFlow, openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { resolveTopicPostponeDelayNextAt } from '../../lib/core/review/topicPostponeDelay';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { node, now, persistence, settings, setupPeers, snapshot } from '../test/dailyFlowExceptions.testSupport';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { isSameWorkspaceReviewSession } from './workspaceHistoryContext';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

let peer: Peer;
let release: () => void;
let requested: () => void;
let rejectRead = false;
let gate: Promise<void>;
let reading: Promise<void>;
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    const facts = readWorkspaceNodeLearning(peer.driver, (args as { nodeIds: string[] }).nodeIds);
    requested(); await gate;
    if (rejectRead) throw new Error('database_unavailable');
    return facts;
  }
  if (command === 'open_daily_flow') return openDailyFlow(peer.port, args as never, settings(peer), persistence);
  if (command === 'commit_daily_flow') return commitDailyFlow(peer.port, args as never, settings(peer), persistence);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected reading command: ${command}`);
} }));
beforeEach(async () => {
  [peer] = await setupPeers(); rejectRead = false;
  gate = new Promise(resolve => { release = resolve; });
  reading = new Promise(resolve => { requested = resolve; });
});
afterEach(closeLibraries);

it.each([1, 2, 3, 4] as const)('saves grade %s once when the same Flow cursor refreshes during its learning read', async grade => {
  const app = await prepare('item');
  const actions = createWorkspaceReviewActions(app.setState, app.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(app.setState, app.getState);
  actions.revealReviewAnswer();
  const before = app.getState().reviewSession;
  const pending = actions.gradeReviewCard(grade, now);
  await reading;
  await openWorkspaceDailyFlow(app.setState, app.getState, { now, mode: 'review-first',
    preserveCurrent: true, preferredNodeId: before.currentNodeId, seed: before }, undefined, true);
  expect(app.getState().reviewSession).not.toBe(before);
  expect(isSameWorkspaceReviewSession(app.getState().reviewSession, before)).toBe(true);
  release();
  expect(await pending).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).not.toBe(before.currentNodeId);
  expect((await snapshot(peer)).nodesById[before.currentNodeId!]?.review?.reps).toBe(1);
  expect(peer.db.prepare("SELECT COUNT(*) AS n FROM review_log WHERE kind='review' AND node_id=?").get(before.currentNodeId!))
    .toEqual({ n: 1 });
  expect(history.undoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById[before.currentNodeId!]?.review?.reps ?? 0).toBe(0);
  expect(history.redoWorkspaceAction()).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect((await snapshot(peer)).nodesById[before.currentNodeId!]?.review?.reps).toBe(1);
});

it.each(['exit', 'navigate', 'restart'] as const)('rejects a pending grade after %s instead of applying it to a changed context', async change => {
  const app = await prepare('item');
  const actions = createWorkspaceReviewActions(app.setState, app.getState, createLocalReviewSchedulerAdapter());
  actions.revealReviewAnswer();
  const pending = actions.gradeReviewCard(3, now);
  await reading;
  if (change === 'exit') actions.exitReviewSession();
  if (change === 'navigate') app.setState({ activeNodeId: 'b' });
  if (change === 'restart') await actions.startReviewSession(now);
  const expected = app.getState().reviewSession;
  release();
  expect(await pending).toBe(false);
  expect(app.getState().reviewSession).toEqual(expected);
  expect(peer.db.prepare("SELECT COUNT(*) AS n FROM review_log WHERE kind='review'").get()).toEqual({ n: 0 });
});

async function prepare(kind: 'topic' | 'item' = 'topic') {
  node(peer, 'a', kind); node(peer, 'b', kind);
  const mode = kind === 'item' ? 'review-first' as const : 'reading-only' as const;
  const { session } = await openDailyFlow(peer.port, { now, mode }, settings(peer), persistence);
  const facts = await snapshot(peer);
  const app = createSetStateHarness({ ...createWorkspaceFixture(Object.values(facts.nodesById) as Node[]),
    libraryScope: settings(peer).scope!, activeNodeId: session.currentNodeId, reviewSession: session, reviewSessionMode: mode });
  return { ...app, actions: createWorkspaceReviewActions(app.setState, app.getState) };
}

it.each([['read', 'library'], ['read', 'target'], ['grade', 'library'], ['grade', 'target']] as const)(
  'discards the prepared %s when its %s changes during the database read', async (action, change) => {
  const app = await prepare(action === 'grade' ? 'item' : 'topic');
  if (action === 'grade') app.actions.revealReviewAnswer();
  const id = app.getState().reviewSession.currentNodeId!;
  const pending = action === 'grade' ? app.actions.gradeReviewCard(3, now) : app.actions.readReviewTopic(now);
  await reading;
  if (change === 'library') app.setState({ libraryScope: 'other-library' });
  else app.setState(state => ({ nodesById: { ...state.nodesById, [id]: { ...state.nodesById[id]!,
    reading: { intervalDurationMs: 60000, intervalGrowthFactor: 1, lastHandledAt: now, nextAt: now,
      priority: 5, readingPosition: 0, repetitionCount: 3, state: 'active' },
    ...(action === 'grade' ? { review: { ...state.nodesById[id]!.review!, reps: 9 } } : {}) } } }));
  release();
  expect(await pending).toBe(false);
  expect((await snapshot(peer)).nodesById[id]?.reading).toBeNull();
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
});

it.each(['read', 'grade'] as const)('does not invent initial facts when the %s database read fails', async action => {
  const app = await prepare(action === 'grade' ? 'item' : 'topic');
  if (action === 'grade') app.actions.revealReviewAnswer();
  rejectRead = true; release();
  expect(await (action === 'grade' ? app.actions.gradeReviewCard(3, now) : app.actions.readReviewTopic(now))).toBe(false);
  expect(peer.db.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
});

it('postpones from current database facts without a resident reading profile', async () => {
  const app = await prepare();
  const id = app.getState().reviewSession.currentNodeId!;
  const before = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
    priority: 3, readingPosition: 27, repetitionCount: 9, state: 'active' as const };
  await persistence.reading(peer.port, { nodeId: id, before: null, after: before }, now);
  release();
  expect(await app.actions.setReviewTopicDelay(id, 4, now)).toBe(true);
  expect((await snapshot(peer)).nodesById[id]?.reading).toEqual({ ...before,
    nextAt: resolveTopicPostponeDelayNextAt({ level: 4, now, reading: before }) });
});

it('rejects a postpone preview whose database reading changed before submission', async () => {
  const app = await prepare();
  const id = app.getState().reviewSession.currentNodeId!;
  const changed = { intervalDurationMs: 777000, intervalGrowthFactor: 1.7, lastHandledAt: now, nextAt: now,
    priority: 3, readingPosition: 27, repetitionCount: 9, state: 'active' as const };
  await persistence.reading(peer.port, { nodeId: id, before: null, after: changed }, now);
  release();
  expect(await app.actions.setReviewTopicDelay(id, 0, now, null)).toBe(false);
  expect((await snapshot(peer)).nodesById[id]?.reading).toEqual(changed);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
});
