// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort';
import { closeDatabaseConnection, openDatabaseConnection } from '../../electron/database/connection';
import { commitDesktopDailyFlow, desktopDailyFlowPersistence, openDesktopDailyFlow } from '../../electron/database/dailyFlow';
import { initializeDatabase } from '../../electron/database/migrate';
import { upsertNodeSnapshot } from '../../electron/database/nodeMutations';
import { loadWorkspaceSnapshot } from '../../electron/database/workspaceSnapshot';
import { loadReviewSchedulerSettings, saveReviewSchedulerSettings } from '../../electron/reviewSchedulerSettings';
import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning';
import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { openDailyFlow } from '../../lib/core/flow/dailyFlowService';
import { createLocalReviewSchedulerAdapter } from '../features/review/model/localReviewSchedulerAdapter';
import { hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { createWorkspaceActionHistoryActions } from './workspaceActionHistory';
import { openWorkspaceDailyFlow } from './workspaceDailyFlowSessionActions';
import { createWorkspaceReviewActions } from './workspaceStoreReviewActions';
import { createQaNode, createSetStateHarness, createWorkspaceFixture } from './workspaceStoreReviewActions.test-support';

let tempRoot = '';
const dailyFlowTest = { loseReceipt: false, afterCommit: undefined as (() => void) | undefined,
  afterOpen: undefined as (() => Promise<void>) | undefined, bridgeCommands: [] as string[] };
vi.mock('../../electron/deviceAnchorStore.js', () => ({
  loadDesktopLibraryWriterBinding: (libraryPath: string) => ({ deviceAnchor: 'daily-flow', libraryPath })
}));
vi.mock('../../electron/ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: tempRoot,
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'), app_log_dir: path.join(tempRoot, 'logs') }) }));
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: () => async (command: string, args: unknown) => {
  dailyFlowTest.bridgeCommands.push(command);
  const { openDesktopDailyFlow, commitDesktopDailyFlow } = await import('../../electron/database/dailyFlow');
  if (command === 'load_node_learning') return readWorkspaceNodeLearning(openDatabaseConnection().driver, (args as { nodeIds: string[] }).nodeIds);
  if (command === 'open_daily_flow') { const result = await openDesktopDailyFlow(args); await dailyFlowTest.afterOpen?.(); return result; }
  if (command === 'commit_daily_flow') {
    const result = await commitDesktopDailyFlow(args);
    dailyFlowTest.afterCommit?.();
    if (dailyFlowTest.loseReceipt) { dailyFlowTest.loseReceipt = false; throw new Error('ipc_receipt_lost'); }
    return result;
  }
  if (command === 'load_workspace_list_projection') {
    const { loadWorkspaceListProjection } = await import('../../lib/core/database/workspaceListProjection');
    return loadWorkspaceListProjection(openDatabaseConnection().driver, args as { nodeIds: string[]; ancestorNodeIds?: string[]; structure: boolean });
  }
  if (command === 'save_node_open_state') return null;
  throw new Error(`Unexpected command: ${command}`);
} }));

const now = '2026-10-26T08:00:00.000Z';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-daily-flow-'));
  initializeDatabase();
  dailyFlowTest.loseReceipt = false;
  dailyFlowTest.afterCommit = undefined;
  dailyFlowTest.afterOpen = undefined;
  dailyFlowTest.bridgeCommands.length = 0;
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function setup(kind: 'item' | 'topic' = 'item') {
  const nodes = ['first', 'second'].map(id => ({ ...createQaNode(id, now), kind,
    ...(kind === 'topic' ? { review: null, reveal: null } : {}) }));
  for (const node of nodes) upsertNodeSnapshot({ nodeId: node.id, title: node.title, kind: node.kind,
    parentNodeId: null, content: node.content, reveal: node.reveal, review: node.review ?? null,
    isTitleManual: true, anchorLink: null, position: 0, createdAt: node.createdAt, updatedAt: node.updatedAt });
  const harness = createSetStateHarness(createWorkspaceFixture(nodes));
  const actions = createWorkspaceReviewActions(harness.setState, harness.getState, createLocalReviewSchedulerAdapter());
  const history = createWorkspaceActionHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...actions, ...history });
  return { ...harness, actions, history };
}


const boundary = new Date(2026, 9, 27, 4).toISOString();
const justBefore = new Date(2026, 9, 27, 3, 59, 59, 999).toISOString();
const count = (table: string) => openDatabaseConnection().driver.queryAll(`SELECT * FROM ${table}`).length;

it.each(['soon', 'read', 'later', 'dismiss', 1, 2, 3, 4] as const)(
  'rebuilds at the configured 04:00 boundary before the first %s', async action => {
    hydrateCurrentReviewSchedulerSettings({ newDayStartsAtHour: 4 });
    const app = setup(typeof action === 'number' ? 'item' : 'topic');
    await app.actions.startReviewSession(justBefore);
    const source = app.getState().reviewSession;
    if (typeof action === 'number') app.actions.revealReviewAnswer();
    dailyFlowTest.bridgeCommands.length = 0;
    const result = typeof action === 'number' ? await app.actions.gradeReviewCard(action, boundary)
      : action === 'soon' ? await app.actions.revisitReviewTopicSoon(boundary)
      : action === 'read' ? await app.actions.readReviewTopic(boundary)
      : action === 'later' ? await app.actions.postponeReviewTopic(boundary)
      : await app.actions.dismissReviewTopic(boundary);
    expect(result).toBe(true);
    expect(dailyFlowTest.bridgeCommands.filter(command => command === 'open_daily_flow' || command === 'commit_daily_flow').slice(0, 2)).toEqual(['open_daily_flow', 'commit_daily_flow']);
    expect(count('daily_flow_operations')).toBe(1);
    expect(count('review_log')).toBe(typeof action === 'number' ? 1 : 0);
    expect(app.getState().appActionHistory.undoStack).toHaveLength(1);
    const after = app.getState();
    expect(after.reviewSession.daily!.dayKey).not.toBe(source.daily!.dayKey);
    expect(after.reviewSession.currentNodeId).not.toBe(source.currentNodeId);
    expect(after.nodesById[after.reviewSession.currentNodeId!]!.content).toBeTruthy();
    const stored = loadWorkspaceSnapshot({ includeBody: true })!;
    expect(stored.nodesById[source.currentNodeId!]!.reading ?? null).toEqual(after.nodesById[source.currentNodeId!]!.reading ?? null);
    expect(stored.nodesById[source.currentNodeId!]!.review).toEqual(after.nodesById[source.currentNodeId!]!.review);
    expect((await openDesktopDailyFlow({ now: boundary, mode: 'recommended' })).session.currentNodeId).toBe(after.reviewSession.currentNodeId);
  });

it('uses the local path across midnight before the learning boundary', async () => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const day = app.getState().reviewSession.daily!.dayKey;
  dailyFlowTest.bridgeCommands.length = 0;
  expect(await app.actions.revisitReviewTopicSoon(justBefore)).toBe(true);
  expect(dailyFlowTest.bridgeCommands).not.toContain('open_daily_flow');
  expect(app.getState().reviewSession.daily!.dayKey).toBe(day);
});

it('shows the fresh planned current and cancels a decision made on yesterday’s later current', async () => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const first = app.getState().reviewSession.currentNodeId;
  await app.actions.revisitReviewTopicSoon(now);
  const yesterday = app.getState().reviewSession;
  expect(yesterday.currentNodeId).not.toBe(first);
  expect(await app.actions.readReviewTopic(boundary)).toBe(false);
  expect(app.getState().reviewSession.currentNodeId).toBe(first);
  expect(count('daily_flow_operations')).toBe(0);
  expect(count('node_reading')).toBe(0);
  const rebuilt = await openDesktopDailyFlow({ now: boundary, mode: 'recommended', seed: yesterday,
    preferredNodeId: yesterday.currentNodeId });
  // The same-day explicit preference remains supported.
  expect(rebuilt.session.currentNodeId).toBe(yesterday.currentNodeId);
});

it.each(['library', 'leave', 'mode'] as const)('does not install a delayed new-day result after %s changes', async change => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  let release!: () => void;
  let entered!: () => void;
  const opened = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  dailyFlowTest.afterOpen = () => { entered(); return held; };
  const operation = app.actions.readReviewTopic(boundary);
  await opened;
  if (change === 'library') app.setState({ libraryScope: 'other-library' });
  else if (change === 'leave') app.actions.exitReviewSession();
  else {
    dailyFlowTest.afterOpen = undefined;
    await openWorkspaceDailyFlow(app.setState, app.getState, { now: boundary, mode: 'review-first' },
      { reviewSessionMode: 'review-first', reviewSessionModeExpiresAt: null });
  }
  const expected = app.getState().reviewSession;
  release();
  expect(await operation).toBe(false);
  expect(app.getState().reviewSession).toBe(expected);
  expect(count('daily_flow_operations')).toBe(0);
});

it('still rejects an old token at the transaction boundary without touching facts', async () => {
  const app = setup('topic');
  await app.actions.startReviewSession(now);
  const source = app.getState().reviewSession;
  await expect(commitDesktopDailyFlow({ opId: 'old-day-soon', now: boundary, token: source.daily!,
    sourceSession: source, readingAction: 'soon', readings: [{ nodeId: source.currentNodeId!, before: null, after: null }] }))
    .rejects.toThrow('daily_flow_changed');
  expect(count('daily_flow_operations')).toBe(0);
  expect(count('node_reading')).toBe(0);
});

it('uses a changed learning-day setting rather than a fixed four-o’clock boundary', async () => {
  hydrateCurrentReviewSchedulerSettings(saveReviewSchedulerSettings({ newDayStartsAtHour: 6 }));
  const app = setup('topic');
  await app.actions.startReviewSession(justBefore);
  const day = app.getState().reviewSession.daily!.dayKey;
  dailyFlowTest.bridgeCommands.length = 0;
  expect(await app.actions.revisitReviewTopicSoon(boundary)).toBe(true);
  expect(dailyFlowTest.bridgeCommands).not.toContain('open_daily_flow');
  expect(app.getState().reviewSession.daily!.dayKey).toBe(day);
  expect(await app.actions.readReviewTopic(new Date(2026, 9, 27, 6).toISOString())).toBe(false);
  expect(app.getState().reviewSession.daily!.dayKey).not.toBe(day);
  expect(count('node_reading')).toBe(0);
});

it.each([{ hour: 5, count: 1 }, { hour: 10, count: 0 }])(
  'reopens on the saved $hour:00 boundary with only progress from the recalculated day', async ({ hour, count }) => {
    hydrateCurrentReviewSchedulerSettings(saveReviewSchedulerSettings({ newDayStartsAtHour: 4 }));
    const app = setup('topic');
    const morning = new Date(2026, 9, 27, 6).toISOString();
    const noon = new Date(2026, 9, 27, 12).toISOString();
    await app.actions.startReviewSession(morning);
    const first = app.getState().reviewSession;
    expect(await app.actions.readReviewTopic(morning)).toBe(true);
    const advanced = app.getState().reviewSession;
    expect(advanced.readTopicCount).toBe(1);
    expect(advanced.currentNodeId).not.toBe(first.currentNodeId);
    app.actions.exitReviewSession();
    hydrateCurrentReviewSchedulerSettings(saveReviewSchedulerSettings({ newDayStartsAtHour: hour }));

    await app.actions.startReviewSession(noon);
    const reopened = app.getState().reviewSession;
    expect(reopened.dayWindow).toEqual(createDailyFlowDayWindow(noon, hour));
    expect(reopened.readTopicCount).toBe(count);
    expect(reopened.currentNodeId).toBe(advanced.currentNodeId);
    const { sqlite } = openDatabaseConnection();
    expect(sqlite.prepare('SELECT day_key FROM daily_flow_state').get()).toEqual({ day_key: reopened.dayWindow!.start });
    expect((await openDesktopDailyFlow({ now: noon, mode: 'recommended' })).session.readTopicCount).toBe(count);
    expect(loadWorkspaceSnapshot({ includeBody: true })!.nodesById[first.currentNodeId!]!.reading?.lastHandledAt).toBe(morning);
    app.actions.exitReviewSession();
    hydrateCurrentReviewSchedulerSettings(saveReviewSchedulerSettings({ newDayStartsAtHour: 4 }));
    await app.actions.startReviewSession(noon);
    const restored = app.getState().reviewSession;
    expect(restored.daily!.dayKey).toBe(first.daily!.dayKey);
    expect(restored.daily!.revision).toBeGreaterThan(advanced.daily!.revision);
    expect(restored.readTopicCount).toBe(1);
  });

it('replans when the new interval ends later even if its start is unchanged', async () => {
  const originalSettings = saveReviewSchedulerSettings({ newDayStartsAtHour: 4 });
  const stamp = new Date(2026, 9, 27, 12).toISOString();
  const updated = createDailyFlowDayWindow(stamp, 10);
  const earlierEnd = new Date(Date.parse(updated.end) - 60 * 60_000).toISOString();
  const due = new Date(Date.parse(updated.end) - 30 * 60_000).toISOString();
  upsertNodeSnapshot({ nodeId: 'late-topic', title: 'Late topic', kind: 'topic', parentNodeId: null,
    content: 'Body', reveal: null, isTitleManual: true, anchorLink: null, position: 0, createdAt: due, updatedAt: stamp });
  const { sqlite } = openDatabaseConnection();
  const first = await openDailyFlow(createBetterSqliteDbPort(sqlite), { now: stamp, mode: 'recommended' },
    { newDayStartsAtHour: originalSettings.newDayStartsAtHour, pushQueue: originalSettings.pushQueue, dayWindow: { start: updated.start, end: earlierEnd } }, desktopDailyFlowPersistence);
  expect(first.session.dayWindow?.end).toBe(earlierEnd);
  expect(count('daily_flow_entries')).toBe(0);
  saveReviewSchedulerSettings({ newDayStartsAtHour: 10 });
  expect(loadReviewSchedulerSettings().newDayStartsAtHour).toBe(10);

  const result = await openDesktopDailyFlow({ now: stamp, mode: 'recommended' });
  expect(result.session.dayWindow).toEqual(updated);
  expect(result.session.daily!.revision).toBeGreaterThan(first.session.daily!.revision);
  expect(sqlite.prepare("SELECT active FROM daily_flow_entries WHERE node_id='late-topic'").get()).toEqual({ active: 1 });
  expect((await openDesktopDailyFlow({ now: due, mode: 'recommended' })).session.currentNodeId).toBe('late-topic');
});
