// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-grade', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'load_node_learning') {
    const { readWorkspaceNodeLearning } = await import('../../lib/core/database/workspaceNodeLearning');
    return readWorkspaceNodeLearning(openDatabaseConnection().driver, (args as { nodeIds: string[] }).nodeIds);
  }
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') return commitDesktopDailyFlow(args);
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, desktopDailyFlowPersistence, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-grade-'));
  initializeDatabase();
});
afterEach(async () => { vi.restoreAllMocks(); closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

async function setup(itemCount = 12, topicCount = 3) {
  const nodes = Array.from({ length: itemCount + topicCount }, (_, i) => ({ ...createQaNode(`node-${i}`, now),
    kind: i < itemCount ? 'item' as const : 'topic' as const,
    ...(i < itemCount ? {} : { review: null, reveal: null }) }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review ?? null,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  await actions.startReviewSession(now);
  return { ...harness, actions, history };
}

function pendingIds() {
  return (openDatabaseConnection().sqlite.prepare(
    'SELECT node_id FROM daily_flow_entries WHERE active=1 AND initial_task=1 ORDER BY order_key'
  ).all() as { node_id: string }[]).map(row => row.node_id);
}

it.each([1, 2, 3, 4] as const)('grade %s preserves the remaining daily order and touches only the graded list row', async grade => {
  const app = await setup();
  const before = app.getState().reviewSession;
  const pendingBefore = pendingIds();
  const db = openDatabaseConnection().sqlite;
  db.exec(`CREATE TABLE touched (node_id TEXT);
    CREATE TRIGGER record_daily_update AFTER UPDATE ON daily_flow_entries
    BEGIN INSERT INTO touched VALUES (NEW.node_id); END;
    CREATE TRIGGER record_daily_insert AFTER INSERT ON daily_flow_entries
    BEGIN INSERT INTO touched VALUES (NEW.node_id); END;
    CREATE TRIGGER record_daily_delete AFTER DELETE ON daily_flow_entries
    BEGIN INSERT INTO touched VALUES (OLD.node_id); END;`);
  const snapshot = vi.spyOn(desktopDailyFlowPersistence, 'learningSnapshot');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(grade, now)).toBe(true);
  const after = app.getState().reviewSession;
  expect(pendingIds()).toEqual(pendingBefore.filter(id => id !== before.currentNodeId));
  expect(after.currentNodeId).toBe(pendingBefore[1]);
  expect(after.currentNodeId).toBe(after.queueNodeIds[0]);
  expect(db.prepare('SELECT DISTINCT node_id FROM touched').all()).toEqual([{ node_id: before.currentNodeId }]);
  expect(snapshot.mock.calls.every(call => call[1] !== undefined)).toBe(true);
  expect(db.prepare('SELECT reps FROM node_review WHERE node_id=?').get(before.currentNodeId)).toEqual({ reps: 1 });
  const history = app.getState().appActionHistory.undoStack.at(-1)!;
  expect(app.history.undoWorkspaceAction(history.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.queueNodeIds).toEqual(before.queueNodeIds);
  expect(app.history.redoWorkspaceAction(history.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.queueNodeIds).toEqual(after.queueNodeIds);
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now, mode: 'recommended' })).session.queueNodeIds).toEqual(after.queueNodeIds);
});

it('reaches the reading already placed after five reviews without restarting the mix cycle', async () => {
  const app = await setup();
  const initial = pendingIds();
  expect(app.getState().nodesById[initial[5]!]!.kind).toBe('topic');
  for (let step = 0; step < 5; step += 1) {
    expect(app.getState().reviewSession.currentNodeId).toBe(initial[step]);
    app.actions.revealReviewAnswer();
    expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  }
  expect(app.getState().reviewSession.currentNodeId).toBe(initial[5]);
  expect(pendingIds()).toEqual(initial.slice(5));
});

it('keeps the remaining mix when an unrelated edit invalidates the daily list', async () => {
  const app = await setup();
  const before = pendingIds();
  openDatabaseConnection().sqlite.prepare("UPDATE nodes SET title='Edited concurrently' WHERE id='node-11'").run();
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(pendingIds()).toEqual(before.slice(1));
  expect(app.getState().reviewSession.currentNodeId).toBe(before[1]);
  expect(openDatabaseConnection().sqlite.prepare("SELECT title FROM nodes WHERE id='node-11'").get()).toEqual({ title: 'Edited concurrently' });
});

it('preserves inherited settings through scoped reads and rejects a deleted parent before grading', async () => {
  const app = await setup();
  const db = openDatabaseConnection().sqlite;
  const target = app.getState().reviewSession.currentNodeId!;
  upsertNodeSnapshot({ nodeId: 'parent', title: 'Parent', kind: 'folder', parentNodeId: null,
    content: '', reveal: null, review: null, isTitleManual: true, anchorLink: null, position: 0, createdAt: now, updatedAt: now });
  db.prepare('UPDATE nodes SET enable_short_term=1 WHERE id=?').run('parent');
  db.prepare('UPDATE nodes SET parent_id=? WHERE id=?').run('parent', target);
  await app.actions.startReviewSession(now);
  const before = app.getState().reviewSession;
  expect(before.currentNodeId).toBe(target);
  const reads = vi.spyOn(desktopDailyFlowPersistence, 'learningSnapshot');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(reads.mock.calls[0]![1]).toContain('parent');
  expect(db.prepare('SELECT due, scheduled_days FROM node_review WHERE node_id=?').get(target)).toEqual({
    due: '2026-10-26T08:10:00.000Z', scheduled_days: 0 });
  const history = app.getState().appActionHistory.undoStack.at(-1)!;
  expect(app.history.undoWorkspaceAction(history.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  const undone = db.prepare('SELECT * FROM node_review WHERE node_id=?').get(target);
  db.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, 'parent');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(db.prepare("SELECT COUNT(*) AS n FROM review_log WHERE kind='review'").get()).toEqual({ n: 1 });
  expect(db.prepare('SELECT * FROM node_review WHERE node_id=?').get(target)).toEqual(undone);
});

it.each([0, 1])('advances after the last review with %s reading candidates without loading unrelated library rows', async topicCount => {
  const app = await setup(1, topicCount);
  const reads = vi.spyOn(desktopDailyFlowPersistence, 'learningSnapshot');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  const session = app.getState().reviewSession;
  expect(session.currentNodeId).toBe(topicCount ? 'node-1' : null);
  expect(session.queueNodeIds).toEqual(topicCount ? ['node-1'] : []);
  expect(session.continueNodeId).toBeNull();
  expect(reads.mock.calls.every(call => call[1] !== undefined)).toBe(true);
  for (const result of reads.mock.results) expect(Object.keys((await result.value).nodesById).length).toBeLessThanOrEqual(1 + topicCount);
});

it('grades from durable facts with only lightweight card status in the workspace and restores those facts on undo', async () => {
  const app = await setup(2, 0);
  const id = app.getState().reviewSession.currentNodeId!;
  const { readWorkspaceNodeLearning } = await import('../../lib/core/database/workspaceNodeLearning');
  const before = readWorkspaceNodeLearning(openDatabaseConnection().driver, [id])[0]!.review;
  app.setState(state => ({ nodesById: { ...state.nodesById, [id]: Object.assign({ ...state.nodesById[id]!, review: null }, {
    learningSummary: { reading: null, review: { lastReviewAt: before?.lastReviewAt ?? null } }
  }) } }));
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(readWorkspaceNodeLearning(openDatabaseConnection().driver, [id])[0]!.review?.reps).toBe(1);
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  expect(app.history.undoWorkspaceAction(entry.id)).toBe(true);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(readWorkspaceNodeLearning(openDatabaseConnection().driver, [id])[0]!.review).toEqual(before);
});
