// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
let loseReceipt = false;
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-reading', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: root,
  app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  if (command === 'open_daily_flow') return openDesktopDailyFlow(args);
  if (command === 'commit_daily_flow') {
    const result = await commitDesktopDailyFlow(args);
    if (loseReceipt) { loseReceipt = false; throw new Error('receipt_lost'); }
    return result;
  }
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, desktopDailyFlowPersistence, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { saveNodeReadingState } from '../../electron/database/nodeReadingState';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { saveReviewSchedulerSettings } from '../../electron/reviewSchedulerSettings';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { hydrateCurrentReviewSchedulerSettings, DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-reading-'));
  initializeDatabase();
  loseReceipt = false;
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
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

it.each(['read', 'later', 'dismiss'] as const)('%s keeps the remaining order and reads only affected nodes', async action => {
  const app = await setup(0, 8);
  const before = app.getState().reviewSession;
  const db = openDatabaseConnection().sqlite;
  db.exec('CREATE TABLE touched (node_id TEXT); CREATE TRIGGER track_daily AFTER UPDATE ON daily_flow_entries BEGIN INSERT INTO touched VALUES (NEW.node_id); END');
  const reads = vi.spyOn(desktopDailyFlowPersistence, 'snapshot');
  const invoke = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic, dismiss: app.actions.dismissReviewTopic };
  expect(await invoke[action](now)).toBe(true);
  expect(app.getState().reviewSession.queueNodeIds).toEqual(before.queueNodeIds.slice(1));
  expect(reads.mock.calls.every(call => call[1] !== undefined && call[1].length <= 2)).toBe(true);
  expect(db.prepare('SELECT * FROM touched').all()).toEqual([{ node_id: before.currentNodeId }]);
});

it.each(['read', 'later', 'dismiss'] as const)('%s rolls back the fact, cursor and history, then retries a lost receipt once', async action => {
  const app = await setup(0, 3);
  const before = app.getState().reviewSession;
  const invoke = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic, dismiss: app.actions.dismissReviewTopic }[action];
  const db = openDatabaseConnection().sqlite;
  db.exec("CREATE TRIGGER reject_daily BEFORE INSERT ON daily_flow_operations BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  expect(await invoke(now)).toBe(false);
  expect(app.getState().reviewSession).toEqual(before);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
  expect(db.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  db.exec('DROP TRIGGER reject_daily');
  loseReceipt = true;
  expect(await invoke(now)).toBe(false);
  const committed = loadWorkspaceSnapshot()!.nodesById[before.currentNodeId!]!.reading;
  expect(await invoke('2026-10-26T08:01:00.000Z')).toBe(true);
  expect(app.getState().nodesById[before.currentNodeId!]!.reading).toEqual(committed);
  expect(db.prepare('SELECT * FROM daily_flow_operations').all()).toHaveLength(1);
  const after = app.getState().reviewSession;
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  app.history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.currentNodeId).toBe(before.currentNodeId);
  app.history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(app.getState().reviewSession.queueNodeIds).toEqual(after.queueNodeIds);
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now, mode: 'recommended' })).session.queueNodeIds).toEqual(after.queueNodeIds);
  expect(loadWorkspaceSnapshot()!.nodesById[before.currentNodeId!]!.reading).toEqual(committed);
});

it.each(['read', 'later'] as const)('%s keeps the configured short reading interval and becomes due behind waiting Soon', async action => {
  const settings = saveReviewSchedulerSettings({ pushQueue: { ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
    readingInitialIntervalMs: 60000, readingIntervalGrowthFactorRange: { min: 4, max: 4 } } });
  hydrateCurrentReviewSchedulerSettings(settings);
  const app = await setup(0, 3);
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z' });
  await app.actions.startReviewSession(now);
  const target = app.getState().reviewSession.currentNodeId!;
  const previous = { intervalDurationMs: 60000, intervalGrowthFactor: 4, lastHandledAt: '2026-10-26T07:00:00.000Z',
    nextAt: now, priority: 10, readingPosition: 0, repetitionCount: 1, state: 'active' as const };
  saveNodeReadingState({ nodeId: target, reading: previous, updatedAt: now });
  app.setState({ nodesById: { ...app.getState().nodesById, [target]: { ...app.getState().nodesById[target]!, reading: previous } } });
  await app.actions.startReviewSession(now);
  const invoke = action === 'read' ? app.actions.readReviewTopic : app.actions.postponeReviewTopic;
  expect(await invoke(now)).toBe(true);
  const reading = loadWorkspaceSnapshot()!.nodesById[target]!.reading!;
  const expected = action === 'read' ? 240000 : 120000;
  expect(reading.intervalDurationMs).toBe(expected);
  expect(reading.nextAt).toBe(new Date(Date.parse(now) + expected).toISOString());
  await app.actions.revisitReviewTopicSoon(now);
  await app.actions.revisitReviewTopicSoon(now);
  const waiting = app.getState().reviewSession.soonNodeIds![0];
  expect(await app.actions.readReviewTopic(reading.nextAt)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe(waiting);
  expect(await app.actions.readReviewTopic(reading.nextAt)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe(target);
});

it.each(['read', 'later', 'dismiss'] as const)('%s rejects changed target facts and corrects a deleted successor', async action => {
  const app = await setup(0, 3);
  const before = app.getState().reviewSession;
  const target = before.currentNodeId!;
  const invoke = { read: app.actions.readReviewTopic, later: app.actions.postponeReviewTopic, dismiss: app.actions.dismissReviewTopic }[action];
  const changed = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now, nextAt: now,
    priority: 10, readingPosition: 0, repetitionCount: 9, state: 'active' as const };
  saveNodeReadingState({ nodeId: target, reading: changed, updatedAt: now });
  expect(await invoke(now)).toBe(false);
  expect(loadWorkspaceSnapshot()!.nodesById[target]!.reading).toEqual(changed);
  expect(app.getState().appActionHistory.undoStack).toEqual([]);
  const next = app.getState().reviewSession.queueNodeIds.find(id => id !== target)!;
  openDatabaseConnection().sqlite.prepare('UPDATE nodes SET deleted_at=? WHERE id=?').run(now, next);
  expect(await invoke(now)).toBe(true);
  expect(app.getState().reviewSession.queueNodeIds).not.toContain(next);
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now, mode: 'recommended' })).session.queueNodeIds).not.toContain(next);
});

it.each(['read', 'read-release', 'later', 'dismiss'] as const)('%s preserves sequential release, related facts and history', async action => {
  const app = await setup(0, 2);
  const [first, second] = app.getState().reviewSession.queueNodeIds as [string, string];
  const folder = { ...createQaNode('source', now), kind: 'folder' as const, reading: null, review: null,
    reveal: null, sequentialReadingEnabled: true, manualChildOrder: [first, second] };
  upsertNodeSnapshot({ nodeId: folder.id, title: folder.title, kind: 'folder', parentNodeId: null,
    content: '', reveal: null, review: null, reading: null, sequentialReadingEnabled: true,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: now, updatedAt: now });
  const locked = { intervalDurationMs: 60000, intervalGrowthFactor: 2, lastHandledAt: now,
    nextAt: now, priority: 10, readingPosition: 0, repetitionCount: 0, state: 'locked' as const };
  const db = openDatabaseConnection().sqlite;
  db.prepare('UPDATE nodes SET parent_id=? WHERE id IN (?,?)').run(folder.id, first, second);
  saveNodeReadingState({ nodeId: second, reading: locked, updatedAt: now });
  const nodes = app.getState().nodesById;
  app.setState({ reviewSessionMode: 'reading-only', reviewSessionModeExpiresAt: '2026-10-27T00:00:00.000Z', nodeOrder: [...app.getState().nodeOrder, folder.id], nodesById: { ...nodes, source: folder,
    [first]: { ...nodes[first]!, parentNodeId: folder.id },
    [second]: { ...nodes[second]!, parentNodeId: folder.id, reading: locked } } });
  await app.actions.startReviewSession(now);
  expect(app.getState().reviewSession.currentNodeId).toBe(first);
  const invoke = action === 'dismiss' ? app.actions.dismissReviewTopic : action === 'later'
    ? app.actions.postponeReviewTopic : app.actions.readReviewTopic;
  const released = action === 'read-release' || action === 'dismiss';
  if (released) {
    db.exec(`CREATE TRIGGER reject_related BEFORE INSERT ON node_reading WHEN NEW.node_id='${second}' BEGIN SELECT RAISE(ABORT, 'related_save_failed'); END`);
    expect(await invoke(now, { releaseSequentialReading: action === 'read-release' })).toBe(false);
    expect(loadWorkspaceSnapshot()!.nodesById[first]!.reading).toBeNull();
    expect(loadWorkspaceSnapshot()!.nodesById[second]!.reading!.state).toBe('locked');
    expect(app.getState().reviewSession.currentNodeId).toBe(first);
    db.exec('DROP TRIGGER reject_related');
  }
  expect(await invoke(now, { releaseSequentialReading: action === 'read-release' })).toBe(true);
  expect(loadWorkspaceSnapshot()!.nodesById[second]!.reading!.state).toBe(released ? 'active' : 'locked');
  expect(app.getState().reviewSession.currentNodeId).toBe(released ? second : null);
  const after = app.getState().reviewSession;
  const entry = app.getState().appActionHistory.undoStack.at(-1)!;
  app.history.undoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  expect(loadWorkspaceSnapshot()!.nodesById[second]!.reading!.state).toBe('locked');
  app.history.redoWorkspaceAction(entry.id);
  await vi.waitFor(() => expect(app.getState().appActionHistory.applying).toBeNull());
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now, mode: 'reading-only' })).session.currentNodeId).toBe(after.currentNodeId);
  expect(loadWorkspaceSnapshot()!.nodesById[second]!.reading!.state).toBe(released ? 'active' : 'locked');
});

it('keeps a newly due minute item behind the existing reading Queue and waiting Soon', async () => {
  const app = await setup(1, 2);
  const db = openDatabaseConnection().sqlite;
  const due = '2026-10-26T08:01:00.000Z';
  db.prepare('UPDATE node_review SET due=?, scheduled_days=0 WHERE node_id=?').run(due, 'node-0');
  await app.actions.startReviewSession(now);
  const topics = [...app.getState().reviewSession.queueNodeIds];
  expect(topics).not.toContain('node-0');
  expect(await app.actions.revisitReviewTopicSoon(now)).toBe(true);
  expect(await app.actions.readReviewTopic(due)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe(topics[0]);
  expect(app.getState().reviewSession.queueNodeIds).toEqual([]);
  expect(await app.actions.readReviewTopic(due)).toBe(true);
  expect(app.getState().reviewSession.currentNodeId).toBe('node-0');
  closeDatabaseConnection();
  initializeDatabase();
  expect((await openDesktopDailyFlow({ now: due, mode: 'recommended' })).session.currentNodeId).toBe('node-0');
});
