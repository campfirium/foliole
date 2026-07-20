import { beforeEach, expect, it, vi } from 'vitest';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

const nativePlugin = vi.hoisted(() => ({
  loadSyncIndex: vi.fn(),
  loadSyncObjects: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => nativePlugin)
}));

beforeEach(() => {
  nativePlugin.loadSyncIndex.mockReset();
  nativePlugin.loadSyncObjects.mockReset();
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

it('hydrates the iOS review scheduler from the shared desktop setting object', async () => {
  const objectId = 'user_space:windows:desktop:*:review_scheduler_settings';
  nativePlugin.loadSyncIndex.mockResolvedValue({
    entries: [{ object_id: objectId, object_type: 'setting' }]
  });
  nativePlugin.loadSyncObjects.mockResolvedValue({
    objects: [{
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
    }]
  });
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
  expect(nativePlugin.loadSyncObjects).toHaveBeenCalledWith({
    object_ids: [objectId],
    object_types: ['setting']
  });
});
