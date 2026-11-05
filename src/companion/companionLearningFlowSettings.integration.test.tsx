import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { prepareDailyFlowPlans } from '../../lib/core/flow/dailyFlowPlanning';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { companionDailyFlowSettings, openCompanionDailyFlow, ownedCompanionDailyFlowPersistence } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

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

it('keeps the live day and current topic after changing the boundary, then adopts it in the next day', async () => {
  const now = '2026-11-03T08:00:00.000Z';
  const open = (stamp: string) => openCompanionDailyFlow({ now: stamp, mode: 'recommended', preserveCurrent: true });
  const before = await open(now);
  expect(before.session.currentNodeId).not.toBeNull();
  render(<CompanionLearningSettingsContent />);
  await changeLearningSetting('New day starts at', '10');
  const after = await open(now);
  expect(after.session.dayWindow).toEqual(before.session.dayWindow);
  expect(after.session.currentNodeId).toBe(before.session.currentNodeId);
  expect(after.session.cycle?.remaining).toBe(before.session.cycle?.remaining);
  const nextInstant = new Date(Date.parse(before.session.dayWindow!.end) + 60_000).toISOString();
  const next = await open(nextInstant);
  expect(next.session.dayWindow).toEqual(createDailyFlowDayWindow(nextInstant, 10));
  const row = library.database.prepare('SELECT session_json FROM daily_flow_state').get() as { session_json: string };
  expect(JSON.parse(row.session_json).dayWindow).toEqual(next.session.dayWindow);
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
