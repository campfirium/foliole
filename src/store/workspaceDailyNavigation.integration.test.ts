
// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';


let tempRoot = '';
let loseReceipt = false;
let afterSave: (() => void) | null = null;
let navigationPayload: Record<string, unknown> | null = null;
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
    if ((args as { navigation?: string }).navigation) navigationPayload = args as Record<string, unknown>;
    afterSave?.();
    if (loseReceipt) { loseReceipt = false; throw new Error('ipc_receipt_lost'); }
    return result;
  }
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { legacyContinuation } from '../test/dailyFlowLegacyContinuation.testSupport';


import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceStorePersistConfig } from './workspaceStorePersistConfig';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createReadingNode, createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-flow-'));
  initializeDatabase();
  loseReceipt = false; afterSave = null; navigationPayload = null;
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function setupAutomatic() {
  const nodes = [createQaNode('review', now), createReadingNode('topic', now), createReadingNode('other', now)];
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const app = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(app.setState, app.getState, createLocalReviewSchedulerAdapter());
  app.setState({ ...actions, ...createWorkspaceActionHistoryActions(app.setState, app.getState) });
  await actions.startReviewSession(now);
  return { ...app, actions };
}

async function setupLegacy() {
  const app = await setupAutomatic();
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  app.setState({ reviewSession: await legacyContinuation(createBetterSqliteDbPort(openDatabaseConnection().sqlite), app.getState().reviewSession, now) });
  expect(app.getState().reviewSession.currentNodeId).toBeNull();
  expect(app.getState().reviewSession.continueNodeId).toBeTruthy();
  return app;
}

it('legacy compatibility: continues through the native save, retains the first payload after a lost receipt, and restores the persisted reading', async () => {
  const app = await setupLegacy();
  const before = app.getState();
  loseReceipt = true;
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before.reviewSession);
  const saved = openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_state');
  expect(await app.actions.continueReviewSessionReading('2026-10-26T08:00:30.000Z')).toBe(true);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_state')).toEqual(saved);
  expect(app.getState().reviewSession.currentNodeId).toBe(before.reviewSession.continueNodeId);
  expect(Object.keys(navigationPayload!).sort()).toEqual(['expectedContinueNodeId', 'navigation', 'now', 'opId', 'token']);
  expect(app.getState().reviewSession.daily!.revision).toBe(before.reviewSession.daily!.revision + 1);
  expect(app.getState().appActionHistory.undoStack).toEqual(before.appActionHistory.undoStack);
  closeDatabaseConnection(); initializeDatabase();
  const restored = await openDesktopDailyFlow({ now, mode: 'recommended' });
  expect(restored.session.currentNodeId).toBe(before.reviewSession.continueNodeId);
  expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[restored.session.currentNodeId!]!.content).toBeTruthy();
  expect(createWorkspaceStorePersistConfig(() => undefined).merge!({}, app.getState()).appActionHistory.undoStack).toEqual([]);
});

it('legacy compatibility: keeps completion and history when navigation fails late, then retries the same transaction', async () => {
  const app = await setupLegacy();
  const before = app.getState();
  const db = openDatabaseConnection();
  const rows = db.driver.queryAll('SELECT * FROM daily_flow_state');
  db.sqlite.exec("CREATE TRIGGER reject_nav BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before.reviewSession);
  expect(db.driver.queryAll('SELECT * FROM daily_flow_state')).toEqual(rows);
  expect(app.getState().appActionHistory).toEqual(before.appActionHistory);
  db.sqlite.exec('DROP TRIGGER reject_nav');
  expect(await app.actions.continueReviewSessionReading(now)).toBe(true);
});

it('legacy compatibility: rejects altered payloads and recovers superseded and cross-day navigation without repeating it', async () => {
  const app = await setupLegacy();
  const source = app.getState().reviewSession;
  loseReceipt = true;
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  const [row] = openDatabaseConnection().driver.queryAll<{ op_id: string }>("SELECT op_id FROM daily_flow_operations ORDER BY rowid DESC LIMIT 1");
  await expect(commitDesktopDailyFlow({ opId: row!.op_id, now: '2026-10-26T08:00:30.000Z', token: source.daily!,
    navigation: 'continue-reading', expectedContinueNodeId: source.continueNodeId })).rejects.toThrow('daily_flow_operation_mismatch');
  await openDesktopDailyFlow({ now, mode: 'recommended', refresh: true });
  const revision = (await openDesktopDailyFlow({ now, mode: 'recommended' })).session.daily!.revision;
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  expect(app.getState().reviewSession.currentNodeId).toBe(source.continueNodeId);
  expect(app.getState().reviewSession.daily!.revision).toBe(revision + 1);
});

it('legacy compatibility: recovers a new learning day before applying a stale continuation', async () => {
  const fresh = await setupLegacy();
  const source = fresh.getState().reviewSession;
  expect(await fresh.actions.continueReviewSessionReading('2026-10-27T08:00:00.000Z')).toBe(false);
  expect(fresh.getState().reviewSession.daily!.dayKey).not.toBe(source.daily!.dayKey);
});


it('legacy compatibility: rejects a library token mismatch without installing a view from another library', async () => {
  const app = await setupLegacy();
  const source = app.getState().reviewSession;
  app.setState({ reviewSession: { ...source, daily: { ...source.daily!, scope: 'other-library' } } });
  const before = app.getState().reviewSession;
  const daily = openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_state');
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  expect(app.getState().reviewSession).toBe(before);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_state')).toEqual(daily);
});


it('legacy compatibility: retains concurrent content when merging a navigation receipt and does not replace a newer view', async () => {
  const app = await setupLegacy();
  const target = app.getState().reviewSession.continueNodeId!;
  afterSave = () => app.setState(state => ({ nodesById: { ...state.nodesById,
    [target]: { ...state.nodesById[target]!, content: 'Concurrent content' } } }));
  expect(await app.actions.continueReviewSessionReading(now)).toBe(true);
  expect(app.getState().nodesById[target]!.content).toBe('Concurrent content');
});

it('legacy compatibility: does not replace a newer desktop view after navigation commits', async () => {
  const app = await setupLegacy();
  const saved = app.getState().reviewSession;
  afterSave = () => app.setState({ reviewSession: { ...saved, currentNodeId: 'newer-view' } });
  expect(await app.actions.continueReviewSessionReading(now)).toBe(false);
  expect(app.getState().reviewSession.currentNodeId).toBe('newer-view');
});

it.each(['rollback', 'lost receipt'] as const)('automatically opens reading after retrying the last grade with %s and restores it after reopening', async failure => {
  const app = await setupAutomatic();
  app.actions.revealReviewAnswer();
  const before = app.getState().reviewSession;
  expect(before.currentNodeId).toBe('review');
  const db = openDatabaseConnection();
  const state = db.driver.queryAll('SELECT * FROM daily_flow_state');
  const entries = db.driver.queryAll('SELECT * FROM daily_flow_entries ORDER BY order_key');
  if (failure === 'rollback') db.sqlite.exec("CREATE TRIGGER reject_auto BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  else loseReceipt = true;
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before);
  if (failure === 'rollback') {
    expect(db.driver.queryAll('SELECT * FROM daily_flow_state')).toEqual(state);
    expect(db.driver.queryAll('SELECT * FROM daily_flow_entries ORDER BY order_key')).toEqual(entries);
    expect(db.driver.queryAll('SELECT * FROM review_log')).toEqual([]);
    expect(app.getState().appActionHistory.undoStack).toEqual([]);
    db.sqlite.exec('DROP TRIGGER reject_auto');
  }
  const committed = db.driver.queryAll('SELECT * FROM daily_flow_state');
  expect(await app.actions.gradeReviewCard(3, '2026-10-26T08:00:30.000Z')).toBe(true);
  if (failure === 'lost receipt') expect(db.driver.queryAll('SELECT * FROM daily_flow_state')).toEqual(committed);
  const after = app.getState().reviewSession;
  expect(['topic', 'other']).toContain(after.currentNodeId);
  expect(after.continueNodeId).toBeNull();
  expect(after.cycle?.clearedAt).toBeTruthy();
  expect(db.driver.queryAll('SELECT * FROM review_log')).toHaveLength(1);
  expect(app.getState().appActionHistory.undoStack).toHaveLength(1);
  closeDatabaseConnection(); initializeDatabase();
  const restored = (await openDesktopDailyFlow({ now, mode: 'recommended' })).session;
  expect(restored).toEqual(after);
  expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[restored.currentNodeId!]!.content).toBeTruthy();
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).not.toBe(after.currentNodeId);
});
