import { beforeEach, expect, it, vi } from 'vitest';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

const iosReads = vi.hoisted(() => ({
  loadSyncIndex: vi.fn(),
  loadSyncObjects: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => ({}))
}));

vi.mock('../shared/platform/companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosSyncIndex: iosReads.loadSyncIndex,
  loadIosSyncObjects: iosReads.loadSyncObjects
}));

beforeEach(() => {
  iosReads.loadSyncIndex.mockReset();
  iosReads.loadSyncObjects.mockReset();
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

it('hydrates the iOS review scheduler from the shared desktop setting object', async () => {
  const objectId = 'user_space:windows:desktop:*:review_scheduler_settings';
  iosReads.loadSyncIndex.mockResolvedValue([
    { object_id: objectId, object_type: 'setting' }
  ]);
  iosReads.loadSyncObjects.mockResolvedValue([{
      content_hash: 'macos-setting-hash',
      deleted_at: null,
      object_id: objectId,
      object_type: 'setting',
      payload_json: JSON.stringify({
        key: 'review_scheduler_settings',
        scope: 'user_space',
        value_json: JSON.stringify({ desiredRetention: 0.87, newDayStartsAtHour: 6 })
      }),
      updated_at: '2026-07-21T00:30:00.000Z'
  }]);
  const { hydrateCompanionReviewSchedulerSettings } = await import(
    './companionReviewSchedulerSettingsHydration'
  );

  await expect(hydrateCompanionReviewSchedulerSettings()).resolves.toMatchObject({
    settings: expect.objectContaining({ desiredRetention: 0.87, newDayStartsAtHour: 6 }),
    status: 'hydrated'
  });
  expect(getCurrentReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.87,
    newDayStartsAtHour: 6
  });
  expect(iosReads.loadSyncObjects).toHaveBeenCalledWith([objectId], ['setting']);
});
