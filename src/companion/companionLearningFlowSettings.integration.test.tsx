import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { prepareDailyFlowPlans } from '../../lib/core/flow/dailyFlowPlanning';
import { resolveReviewSessionProgress } from '../../lib/core/flow/flowSessionProgress';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { companionDailyFlowSettings, openCompanionDailyFlow, ownedCompanionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow';
import { replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { CompanionBottomReviewBar } from './CompanionBottomReviewBar';
import { persistFlowMutation } from './companionFlowMutation';
import { changeLearningSetting } from './companionLearningSettings.testSupport';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(2, 32);
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});
afterEach(async () => { await library.close(); });

it.each([1, 2])('opens Flow on the saved boundary and keeps %i completed Topics', async completed => {
  const now = new Date(2026, 10, 3, 12).toISOString();
  const open = (stamp: string) => openCompanionDailyFlow({ now: stamp, mode: 'recommended', preserveCurrent: true });
  const before = await open(now);
  expect(before.session.currentNodeId).not.toBeNull();
  let session = before.session;
  for (let index = 0; index < completed; index++) {
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    const read = await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now, snapshot,
      history: { key: 'learning-settings', mode: 'recommended', session } });
    session = read.session!;
  }
  expect(session.readTopicCount).toBe(completed);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('New day starts at', '10');
  expect((await loadCompanionReviewSettings()).newDayStartsAtHour).toBe(10);
  const after = await open(now);
  const updated = createDailyFlowDayWindow(now, 10);
  expect(updated.start).not.toBe(before.session.dayWindow?.start);
  expect(after.session.dayWindow).toEqual(updated);
  expect(after.session.currentNodeId).toBe(session.currentNodeId);
  expect(resolveReviewSessionProgress(after.session)).toEqual({ reviewCompletedCount: completed, reviewQueueCount: 2 - completed });
  const formerRollover = await open(before.session.dayWindow!.end);
  expect(formerRollover.session.dayWindow).toEqual(updated);
  expect(formerRollover.session.readTopicCount).toBe(completed);
  const next = await open(updated.end);
  expect(next.session.dayWindow).toEqual(createDailyFlowDayWindow(updated.end, 10));
  expect(next.session.readTopicCount).toBe(0);
  const row = library.database.prepare('SELECT session_json FROM daily_flow_state').get() as { session_json: string };
  expect(JSON.parse(row.session_json).dayWindow).toEqual(next.session.dayWindow);
});

it('retains overlapping Flow progress when a workspace undo prepares the changed day', async () => {
  const stamp = new Date(2026, 10, 3, 12);
  const now = stamp.toISOString();
  vi.setSystemTime(stamp);
  try {
    const params = { now, mode: 'recommended' as const };
    const { session } = await openCompanionDailyFlow(params);
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    const read = await persistFlowMutation({ action: 'read', nodeId: session.currentNodeId!, now, snapshot,
      history: { key: 'learning-settings', mode: params.mode, session } });
    expect(read.session?.readTopicCount).toBe(1);
    await mutateCompanionWorkspace({ type: 'create', nodeId: 'undo-folder', kind: 'folder', parentNodeId: null, title: 'Undo folder' });
    const { unmount } = render(<CompanionLearningSettingsContent />);
    await changeLearningSetting('New day starts at', '10');
    unmount();

    const restored = await replayCompanionFlowHistory(companionFlowHistoryKey('Search'), 'undo', createEmptyReviewSession());
    expect(restored?.readTopicCount).toBe(1);
    expect(restored?.dayWindow).toEqual(createDailyFlowDayWindow(now, 10));
    expect((await loadCompanionWorkspaceSyncState()).workspace_snapshot!.trashedNodeIds).toContain('undo-folder');
    expect(restored?.currentNodeId).toBe(read.session?.currentNodeId);
    const reopened = await openCompanionDailyFlow(params);
    expect(reopened.session.dayWindow).toEqual(restored?.dayWindow);
    expect(resolveReviewSessionProgress(reopened.session)).toEqual({ reviewCompletedCount: 1, reviewQueueCount: 1 });
    const currentSnapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    const second = await persistFlowMutation({ action: 'read', nodeId: reopened.session.currentNodeId!, now, snapshot: currentSnapshot,
      history: { key: 'learning-settings', mode: params.mode, session: reopened.session } });
    expect(second.session?.readTopicCount).toBe(2);
    expect(library.database.prepare("SELECT count(*) AS total FROM daily_flow_sync_facts WHERE kind='advance'").get())
      .toEqual({ total: 2 });
    expect((await openCompanionDailyFlow(params)).session.readTopicCount).toBe(2);
  } finally {
    vi.useRealTimers();
  }
});

it('uses a changed default priority for unassigned topics while retaining explicit priorities', async () => {
  library.database.prepare("UPDATE nodes SET priority=1 WHERE id='000000'").run();
  async function priorities() {
    return getIosCompanionDatabaseOwner().read(async db => {
      const settings = companionDailyFlowSettings();
      const snapshot = await ownedCompanionDailyFlowPersistence(settings).learningSnapshot(db);
      return snapshot.nodePriorities!;
    });
  }
  expect((await priorities()).get('000001')).toBe(5);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Default topic priority', '9');
  expect((await priorities()).get('000000')).toBe(1);
  expect((await priorities()).get('000001')).toBe(9);
  expect(library.database.prepare("SELECT priority FROM nodes WHERE id='000001'").get()).toEqual({ priority: null });
});

it('uses the saved weight in real planning, with stronger preference for high priority topics', async () => {
  library.database.prepare("UPDATE nodes SET priority=9").run();
  const insert = library.database.prepare(`INSERT INTO nodes (id,title,content,priority,created_at,updated_at) VALUES (?,?,?,?,'2026-01-01','2026-01-01')`);
  for (let index = 0; index < 24; index++) insert.run(`topic-${index}`, 'Topic', 'Body', index < 12 ? 1 : 9);
  async function order() {
    return getIosCompanionDatabaseOwner().read(async db => {
      const settings = companionDailyFlowSettings();
      const snapshot = await ownedCompanionDailyFlowPersistence(settings).learningSnapshot(db);
      return prepareDailyFlowPlans(snapshot, { now: '2026-11-03T08:00:00.000Z', mode: 'reading-only' }, settings).initial.readingQueueNodeIds;
    });
  }
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Priority weight', '1');
  const equal = await order();
  await changeLearningSetting('Priority weight', '100');
  const weighted = await order();
  const high = new Set(Array.from({ length: 12 }, (_, index) => `topic-${index}`));
  const positionSum = (ids: string[]) => ids.reduce((sum, id, index) => sum + (high.has(id) ? index : 0), 0);
  expect(weighted).not.toEqual(equal);
  expect(positionSum(weighted)).toBeLessThan(positionSum(equal));
});

it('uses the configured reading/review ratio when the next daily list is planned', async () => {
  const topic = library.database.prepare(`INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES (?,?,?,'2026-01-01','2026-01-01')`);
  const item = library.database.prepare(`INSERT INTO nodes (id,kind,title,content,reveal,initial_review_due,created_at,updated_at)
    VALUES (?,'item',?,?,?,'2026-01-01T00:00:00Z','2026-01-01','2026-01-01')`);
  for (let index = 0; index < 6; index++) {
    topic.run(`topic-${index}`, 'Topic', 'Body');
    item.run(`item-${index}`, 'Question', 'Question', 'Answer');
  }
  const now = '2026-11-03T08:00:00.000Z';
  const rows = () => (library.database.prepare(`SELECT n.kind FROM daily_flow_entries e JOIN nodes n ON n.id=e.node_id
    WHERE e.initial_task=1 ORDER BY e.order_key`).all() as { kind: string }[]).map(row => row.kind);
  await openCompanionDailyFlow({ now, mode: 'recommended' });
  expect(rows().slice(0, 6)).toEqual(['item', 'item', 'item', 'item', 'item', 'topic']);
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Reading queue mix ratio', '3');
  await changeLearningSetting('Review item queue mix ratio', '1');
  const existing = await openCompanionDailyFlow({ now, mode: 'recommended', preserveCurrent: true });
  const next = new Date(Date.parse(existing.session.dayWindow!.end) + 60_000).toISOString();
  await openCompanionDailyFlow({ now: next, mode: 'recommended' });
  expect(rows().slice(0, 4)).toEqual(['item', 'topic', 'topic', 'topic']);
  expect(getCurrentReviewSchedulerSettings().pushQueue.queueMixRatio).toEqual({ reading: 3, fsrs: 1 });
});

it('uses the saved reading interval and growth on consecutive real Read actions without rewriting existing progress', async () => {
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('Reading initial interval days', '2');
  await changeLearningSetting('Reading growth factor min', '2');
  await changeLearningSetting('Reading growth factor max', '2');
  async function read(now: string) {
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    await persistFlowMutation({ action: 'read', nodeId: '000000', now, snapshot });
    return library.database.prepare("SELECT interval_duration_ms, repetition_count, next_at FROM node_reading WHERE node_id='000000'")
      .get() as { interval_duration_ms: number; repetition_count: number; next_at: string };
  }
  const first = await read('2026-11-03T08:00:00.000Z');
  expect(first).toEqual({ interval_duration_ms: 2 * 86_400_000, repetition_count: 1, next_at: '2026-11-05T08:00:00.000Z' });
  await changeLearningSetting('Reading growth factor max', '3');
  await changeLearningSetting('Reading growth factor min', '3');
  expect(library.database.prepare("SELECT interval_duration_ms,repetition_count,next_at FROM node_reading WHERE node_id='000000'").get()).toEqual(first);
  const second = await read(first.next_at);
  expect(second).toEqual({ interval_duration_ms: 6 * 86_400_000, repetition_count: 2, next_at: '2026-11-11T08:00:00.000Z' });
});

it('keeps Later automatic by default and shows the saved delay before a single touch', async () => {
  const postpone = vi.fn();
  render(<>
    <CompanionLearningSettingsContent />
    <CompanionBottomReviewBar isAnswerRevealed={false} itemKind="reading" visible reviewCardKey="000000"
      onPostponeReviewTopic={postpone} onReadReviewTopic={vi.fn()} onDismissReviewTopic={vi.fn()}
      onGrade={vi.fn()} onRevealAnswer={vi.fn()} />
  </>);
  expect(await screen.findByRole('button', { name: /^Custom Later interval\s*Default$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Later$/ })).toBeInTheDocument();
  const field = 'Custom Later interval';
  fireEvent.click(screen.getByRole('button', { name: /^Custom Later interval\s*Default$/ }));
  const input = screen.getByRole('spinbutton', { name: field });
  fireEvent.change(input, { target: { value: '2.5' } });
  expect(input).toBeInvalid();
  fireEvent.submit(input.closest('form')!);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await changeLearningSetting(field, '1');
  expect(screen.getByText('Later · You have read part of it and want to continue in 1 day (custom).')).toBeVisible();
  for (const days of ['2', '3', '17']) await changeLearningSetting(field, days);
  expect(screen.getByText('Later · You have read part of it and want to continue in 17 days (custom).')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^Later$/ }));
  expect(postpone).toHaveBeenCalledTimes(1);
  await changeLearningSetting(field, '0');
  expect(screen.getByRole('button', { name: /^Later$/ })).toBeInTheDocument();
  expect(screen.queryByText('Later · You have read part of it and want to continue in 17 days (custom).')).not.toBeInTheDocument();
  expect((await loadCompanionReviewSettings()).readingLaterDays).toBe(0);
});
