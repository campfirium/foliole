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
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
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

function setup(kind: 'item' | 'topic' | 'mixed' = 'item', futureTopic = false) {
  const nodes = (futureTopic ? ['first', 'second', 'future'] : ['first', 'second']).map(id => ({
    ...createQaNode(id, id === 'future' ? '2026-10-26T08:01:00.000Z' : now),
    kind: kind === 'mixed' ? id === 'first' ? 'topic' as const : 'item' as const : kind,
    ...(kind === 'topic' || (kind === 'mixed' && id === 'first') ? { review: null, reveal: null } : {}) }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  return { ...harness, actions, history };
}

const later = '2026-10-26T08:02:00.000Z';
it.each(['read', 'later', 'dismiss'] as const)('keeps waiting Soon ahead of newly due reading after %s', async action => {
  const app = setup('topic', true);
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z' });
  await app.actions.startReviewSession(now);
  const [first, second] = app.getState().reviewSession.queueNodeIds;
  expect(app.getState().reviewSession.queueNodeIds).toHaveLength(2);
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(true);
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe(first);
  expect(app.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(app.getState().reviewSession.readTopicCount).toBe(2);
  const actions = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic,
    dismiss: app.actions.dismissReviewTopic };
  expect(await actions[action](later)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe(second);
  expect(app.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(app.getState().reviewSession.readTopicCount).toBe(2);
  const persisted = await openDesktopDailyFlow({ now: later, mode: 'reading-only' });
  expect(persisted.session.currentNodeId).toBe(second);
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  app.history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe(first);
  app.history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe(second);
});

it('keeps Soon out of the original Queue across a refresh and database restart', async () => {
  const app = setup('topic', true);
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z' });
  await app.actions.startReviewSession(now);
  const [first, second] = app.getState().reviewSession.queueNodeIds;
  await app.actions.revisitReviewTopicSoon(now);
  const restored = await openDesktopDailyFlow({ now: later, mode: 'reading-only', refresh: true });
  expect(restored.session.queueNodeIds).toEqual([second]);
  expect(restored.session.soonNodeIds).toEqual([first]);
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now: later, mode: 'reading-only' })).session).toEqual(restored.session);
});

it('rolls back Soon progress and history, then retries a lost receipt without moving it twice', async () => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const before = app.getState().reviewSession;
  openDatabaseConnection().sqlite.exec("CREATE TRIGGER reject_soon BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_soon');
  loseReceipt = true;
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(false);
  expect(await app.actions.revisitReviewTopicSoon(later)).toBe(true);
  expect(app.getState().reviewSession.soonNodeIds).toEqual([before.currentNodeId]);
  expect(app.getState().reviewSession.readTopicCount).toBe(1);
  expect(app.getState().appActionHistory.undoStack).toHaveLength(1);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_operations')).toHaveLength(1);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM node_reading')).toEqual([]);
});

it('moves only the current persistent list row when postponing a topic with Soon', async () => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const before = app.getState().reviewSession;
  const remaining = openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_entries WHERE node_id <> ?', [before.currentNodeId!]);
  await app.actions.revisitReviewTopicSoon(now);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM daily_flow_entries WHERE node_id <> ?', [before.currentNodeId!])).toEqual(remaining);
});

it('preserves Soon across a mode change and the last item grade without returning it to Queue', async () => {
  const app = setup('mixed');
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z' });
  await app.actions.startReviewSession(now);
  expect(app.getState().reviewSession.currentNodeId).toBe('first');
  await app.actions.revisitReviewTopicSoon(now);
  app.setState({ reviewSessionMode: 'recommended' });
  await app.actions.startReviewSession(now);
  await app.actions.revisitReviewTopicSoon(now);
  expect(app.getState().reviewSession.currentNodeId).toBe('second');
  app.actions.revealReviewAnswer();
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe('first');
  expect(app.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(app.getState().reviewSession.soonNodeIds).toEqual([]);
  expect((await openDesktopDailyFlow({ now, mode: 'recommended' })).session.currentNodeId).toBe('first');
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  app.history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe('second');
  expect(app.getState().reviewSession.soonNodeIds).toEqual(['first']);
  app.history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe('first');
});

it('keeps reading Soon through review-only grading, history replay and restart', async () => {
  const app = setup('mixed');
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z' });
  await app.actions.startReviewSession(now);
  await app.actions.revisitReviewTopicSoon(now);
  app.setState({ reviewSessionMode: 'recommended' });
  await app.actions.startReviewSession(now);
  await app.actions.revisitReviewTopicSoon(now);
  openDatabaseConnection().sqlite.exec("CREATE TRIGGER reject_mode BEFORE UPDATE ON daily_flow_state BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await openDesktopDailyFlow({ now, mode: 'review-first' }).catch(() => null)).toBeNull();
  expect((await openDesktopDailyFlow({ now, mode: 'recommended' })).session.soonNodeIds).toEqual(['first']);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_mode');
  app.actions.setReviewSessionMode('review-first', now);
  await vi.waitFor(() => expect(app.getState().reviewSessionMode).toBe('review-first'));
  expect(app.getState().reviewSession.currentNodeId).toBe('second');
  expect(app.getState().reviewSession.soonNodeIds).toEqual([]);
  app.actions.revealReviewAnswer();
  const beforeGrade = app.getState().reviewSession;
  openDatabaseConnection().sqlite.exec("CREATE TRIGGER reject_grade BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(beforeGrade);
  openDatabaseConnection().sqlite.exec('DROP TRIGGER reject_grade');
  loseReceipt = true;
  expect(await app.actions.gradeReviewCard(3, now)).toBe(false);
  expect(await app.actions.gradeReviewCard(3, now)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBeNull();
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  app.history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe('second');
  app.history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBeNull();
  const count = app.getState().reviewSession.readTopicCount;
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now, mode: 'review-first' })).session.currentNodeId).toBeNull();
  const restored = (await openDesktopDailyFlow({ now, mode: 'recommended' })).session;
  expect(restored.currentNodeId).toBe('first');
  expect(restored.queueNodeIds).toEqual([]);
  expect(restored.readTopicCount).toBe(count);
  expect(restored.reviewedItemCount).toBe(1);
});
