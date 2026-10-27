// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
let loseReceipt = false;
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-flow', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: tempRoot,
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  const { openDesktopDailyFlow, commitDesktopDailyFlow } = await import('../../electron/database/dailyFlow');
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') {
    const result = await commitDesktopDailyFlow(args);
    if (loseReceipt) { loseReceipt = false; throw new Error('ipc_receipt_lost'); }
    return result;
  }
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-flow-'));
  initializeDatabase();
  loseReceipt = false;
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function setup(kind: 'item' | 'topic' = 'item') {
  const nodes = ['first', 'second'].map(id => ({ ...createQaNode(id, now), kind,
    ...(kind === 'topic' ? { review: null, reveal: null } : {}) }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  return { ...harness, actions, history };
}

it('keeps the daily cursor and grade atomic, retries a lost native receipt once, and clears only desktop undo on restart', async () => {
  const app = setup();
  expect(await app.actions.startReviewSession(now)).toBe(true);
  const original = app.getState().reviewSession;
  expect(original.daily).toBeDefined();
  app.actions.revealReviewAnswer();
  loseReceipt = true;
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(app.getState().reviewSession.currentNodeId).toBe(original.currentNodeId);
  expect(await app.actions.gradeReviewCard(3, '2026-10-26T08:00:30.000Z')).toBe(true);
  const after = app.getState();
  const stored = loadWorkspaceSnapshot({ includeBody: true })!;
  expect(after.nodesById[original.currentNodeId!]!.review).toEqual(stored.nodesById[original.currentNodeId!]!.review);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log')).toHaveLength(1);
  expect(after.appActionHistory.undoStack).toHaveLength(1);
  const entry = after.appActionHistory.undoStack.at(-1)!;
  expect(JSON.stringify(entry)).not.toContain('"queueNodeIds":["');
  if (!('afterContext' in entry)) throw new Error('missing_flow_history');
  expect(entry.afterContext.reviewSession.cycle?.change?.after).toHaveLength(1);
  expect(entry.afterContext.reviewSession.flowFormat).toBe('cycle-v1');
  expect(app.history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().nodesById[original.currentNodeId!]!.review?.reps ?? 0).toBe(0);
  expect(app.history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().nodesById[original.currentNodeId!]!.review?.reps).toBe(1);
  closeDatabaseConnection();
  initializeDatabase();
  const reopened = await openDesktopDailyFlow({ now, mode: 'recommended' });
  expect(reopened.session.currentNodeId).toBe(after.reviewSession.currentNodeId);
  expect(reopened.session.queueNodeIds).toEqual(after.reviewSession.queueNodeIds);
  const hydrated = createWorkspaceStorePersistConfig(() => undefined).merge!({
    ...after, reviewSession: reopened.session
  }, after);
  expect(hydrated.appActionHistory.undoStack).toEqual([]);
});

it.each(['read', 'later', 'soon', 'dismiss'] as const)('commits %s and desktop undo/redo with its daily cursor', async action => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const before = app.getState().reviewSession;
  const actions = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic,
    soon: app.actions.revisitReviewTopicSoon, dismiss: app.actions.dismissReviewTopic };
  expect(await actions[action](now)).toBe(true);
  const after = app.getState();
  const reading = after.nodesById[before.currentNodeId!]!.reading ?? null;
  const entry = after.appActionHistory.undoStack.at(-1)!;
  expect(JSON.stringify(entry)).not.toContain('"queueNodeIds":["');
  if (!('afterContext' in entry)) throw new Error('missing_flow_history');
  expect(entry.afterContext.reviewSession.cycle?.change?.after).toHaveLength(1);
  expect(entry.afterContext.reviewSession.flowFormat).toBe('cycle-v1');
  expect(app.history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe(before.currentNodeId);
  expect(app.history.redoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe(after.reviewSession.currentNodeId);
  expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[before.currentNodeId!]!.reading ?? null).toEqual(reading);
  const persisted = await openDesktopDailyFlow({ now, mode: 'recommended' });
  expect(persisted.session.queueNodeIds).toEqual(app.getState().reviewSession.queueNodeIds);
  expect(persisted.session.soonNodeIds).toEqual(app.getState().reviewSession.soonNodeIds);
});

it('rolls back a late cursor receipt failure and retries without advancing or adding a second grade', async () => {
  const app = setup();
  await app.actions.startReviewSession(now);
  app.actions.revealReviewAnswer();
  const before = app.getState().reviewSession;
  openDatabaseConnection().sqlite.exec("CREATE TRIGGER reject_daily BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log')).toEqual([]);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_daily');
  expect(await app.actions.gradeReviewCard(3, '2026-10-26T08:00:30.000Z')).toBe(true);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log')).toHaveLength(1);
});

it('reopens the new learning day before retrying an old-day action without silently grading it twice', async () => {
  const app = setup();
  await app.actions.startReviewSession(now);
  app.actions.revealReviewAnswer();
  const before = app.getState().reviewSession;
  const nextDay = '2026-10-27T08:00:00.000Z';
  expect(await app.actions.gradeReviewCard(3, nextDay)).toBe(false);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log')).toEqual([]);
  expect(app.getState().reviewSession.daily!.dayKey).not.toBe(before.daily!.dayKey);
  expect(app.getState().reviewSession.currentNodeId).toBe(before.currentNodeId);
  expect(app.getState().reviewSession.isAnswerRevealed).toBe(true);
  expect(await app.actions.gradeReviewCard(3, nextDay)).toBe(true);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log')).toHaveLength(1);
});

it.each(['grade', 'soon', 'read', 'later', 'dismiss'] as const)('retries desktop %s undo and redo after losing each native receipt', async action => {
  const app = setup(action === 'grade' ? 'item' : 'topic');
  await app.actions.startReviewSession(now);
  app.actions.revealReviewAnswer();
  const actions = { grade: () => app.actions.gradeReviewCard(3, now),
    read: () => app.actions.readReviewTopic(now), later: () => app.actions.postponeReviewTopic(now),
    soon: () => app.actions.revisitReviewTopicSoon(now), dismiss: () => app.actions.dismissReviewTopic(now) };
  expect(await actions[action]()).toBe(true);
  for (const mode of ['undo', 'redo'] as const) {
    const history = structuredClone(app.getState().appActionHistory);
    const apply = mode === 'undo' ? app.history.undoWorkspaceAction : app.history.redoWorkspaceAction;
    loseReceipt = true;
    expect(apply()).toBe(true);
    await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
    expect(app.getState().appActionHistory.undoStack).toEqual(history.undoStack);
    expect(app.getState().appActionHistory.redoStack).toEqual(history.redoStack);
    const facts = openDatabaseConnection().driver.queryAll('SELECT * FROM review_log ORDER BY op_id');
    const reading = openDatabaseConnection().driver.queryAll('SELECT * FROM node_reading ORDER BY node_id');
    expect(apply()).toBe(true);
    await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
    expect(openDatabaseConnection().driver.queryAll('SELECT * FROM review_log ORDER BY op_id')).toEqual(facts);
    expect(openDatabaseConnection().driver.queryAll('SELECT * FROM node_reading ORDER BY node_id')).toEqual(reading);
    expect(app.getState().appActionHistory[mode === 'undo' ? 'redoStack' : 'undoStack']).toHaveLength(1);
  }
});
