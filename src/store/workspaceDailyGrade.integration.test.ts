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
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  await actions.startReviewSession(now);
  return { ...harness, actions, history };
}

it.each([1, 2, 3, 4] as const)('grade %s preserves the remaining daily order and touches only the graded list row', async grade => {
  const app = await setup();
  const before = app.getState().reviewSession;
  const db = openDatabaseConnection().sqlite;
  db.exec(`CREATE TABLE touched (node_id TEXT);
    CREATE TRIGGER record_daily_update AFTER UPDATE ON daily_flow_entries
    BEGIN INSERT INTO touched VALUES (NEW.node_id); END;`);
  const snapshot = vi.spyOn(desktopDailyFlowPersistence, 'snapshot');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(grade, now)).toBe(true);
  const after = app.getState().reviewSession;
  expect(after.queueNodeIds).toEqual(before.queueNodeIds.filter(id => id !== before.currentNodeId));
  expect(after.currentNodeId).toBe(after.queueNodeIds[0]);
  expect(db.prepare('SELECT * FROM touched').all()).toEqual([{ node_id: before.currentNodeId }]);
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
  const initial = app.getState().reviewSession.queueNodeIds;
  expect(app.getState().nodesById[initial[5]!]!.kind).toBe('topic');
  for (let step = 0; step < 5; step += 1) {
    expect(app.getState().reviewSession.currentNodeId).toBe(initial[step]);
    app.actions.revealReviewAnswer();
    expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  }
  expect(app.getState().reviewSession.currentNodeId).toBe(initial[5]);
  expect(app.getState().reviewSession.queueNodeIds).toEqual(initial.slice(5));
});

it('keeps the remaining mix when an unrelated edit invalidates the daily list', async () => {
  const app = await setup();
  const before = app.getState().reviewSession;
  openDatabaseConnection().sqlite.prepare("UPDATE nodes SET title='Edited concurrently' WHERE id='node-11'").run();
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(app.getState().reviewSession.queueNodeIds).toEqual(before.queueNodeIds.slice(1));
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
  const reads = vi.spyOn(desktopDailyFlowPersistence, 'snapshot');
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

it.each([0, 1])('finishes the last review with %s reading candidates without loading unrelated library rows', async topicCount => {
  const app = await setup(1, topicCount);
  const reads = vi.spyOn(desktopDailyFlowPersistence, 'snapshot');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  const session = app.getState().reviewSession;
  expect(session.currentNodeId).toBeNull();
  expect(session.queueNodeIds).toEqual([]);
  expect(session.continueNodeId).toBe(topicCount ? 'node-1' : null);
  expect(reads.mock.calls.every(call => call[1] !== undefined)).toBe(true);
  for (const result of reads.mock.results) expect(Object.keys((await result.value).nodesById)).toHaveLength(1 + topicCount);
});
