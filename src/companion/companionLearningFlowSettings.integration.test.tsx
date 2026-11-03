import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDailyFlowDayWindow } from '../../lib/core/flow/dailyFlowDayWindow';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS, hydrateCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';

import { changeLearningSetting } from './companionLearningSettings.testSupport';
import { CompanionLearningSettingsContent } from './CompanionLearningSettingsContent';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
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
