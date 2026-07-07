import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings
} from '../features/settings/model/reviewSchedulerSettings';

const syncObjectsMock = vi.hoisted(() => ({
  loadCompanionSyncIndex: vi.fn(),
  loadCompanionSyncObjects: vi.fn()
}));

vi.mock('../shared/platform/companionSyncObjects', () => syncObjectsMock);

function createSettings(overrides: Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS> = {}) {
  return {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    ...overrides
  };
}

function settingObject(args: {
  objectId?: string;
  scope?: string;
  settings?: Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS>;
  updatedAt?: string;
  valueJson?: string;
}) {
  const scope = args.scope ?? 'user_space';
  return {
    content_hash: 'hash',
    deleted_at: null,
    object_id: args.objectId ?? `${scope}:windows:desktop:*:review_scheduler_settings`,
    object_type: 'setting' as const,
    payload_json: JSON.stringify({
      key: 'review_scheduler_settings',
      scope,
      value_json: args.valueJson ?? JSON.stringify(createSettings(args.settings))
    }),
    updated_at: args.updatedAt ?? '2026-04-22T08:00:00.000Z'
  };
}

async function testHydratesSyncedSettings() {
  const object = settingObject({
    settings: { desiredRetention: 0.82, newDayStartsAtHour: 7 },
    updatedAt: '2026-04-22T08:10:00.000Z'
  });
  syncObjectsMock.loadCompanionSyncIndex.mockResolvedValue([
    { object_id: object.object_id, object_type: 'setting' }
  ]);
  syncObjectsMock.loadCompanionSyncObjects.mockResolvedValue([object]);
  const api = await import('./companionReviewSchedulerSettingsHydration');

  await expect(api.hydrateCompanionReviewSchedulerSettings()).resolves.toMatchObject({
    settings: expect.objectContaining({ desiredRetention: 0.82, newDayStartsAtHour: 7 }),
    status: 'hydrated'
  });
  expect(getCurrentReviewSchedulerSettings()).toMatchObject({
    desiredRetention: 0.82,
    newDayStartsAtHour: 7
  });
  expect(syncObjectsMock.loadCompanionSyncObjects).toHaveBeenCalledWith([object.object_id], ['setting']);
}

async function testSelectsLatestSyncedSettings() {
  const older = settingObject({
    objectId: 'user_space:windows:desktop:*:review_scheduler_settings',
    settings: { desiredRetention: 0.81 },
    updatedAt: '2026-04-22T08:00:00.000Z'
  });
  const newer = settingObject({
    objectId: 'user_space:android:phone:*:review_scheduler_settings',
    settings: { desiredRetention: 0.88 },
    updatedAt: '2026-04-22T08:20:00.000Z'
  });
  syncObjectsMock.loadCompanionSyncIndex.mockResolvedValue([
    { object_id: older.object_id, object_type: 'setting' },
    { object_id: newer.object_id, object_type: 'setting' }
  ]);
  syncObjectsMock.loadCompanionSyncObjects.mockResolvedValue([older, newer]);
  const api = await import('./companionReviewSchedulerSettingsHydration');

  await expect(api.hydrateCompanionReviewSchedulerSettings()).resolves.toMatchObject({
    settings: expect.objectContaining({ desiredRetention: 0.88 }),
    status: 'hydrated'
  });
}

async function testUsesDefaultsWithoutSyncedSettings() {
  hydrateCurrentReviewSchedulerSettings(createSettings({ desiredRetention: 0.82 }));
  syncObjectsMock.loadCompanionSyncIndex.mockResolvedValue([
    { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' }
  ]);
  const api = await import('./companionReviewSchedulerSettingsHydration');

  await expect(api.hydrateCompanionReviewSchedulerSettings()).resolves.toEqual({
    settings: DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    status: 'default'
  });
  expect(getCurrentReviewSchedulerSettings()).toEqual(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  expect(syncObjectsMock.loadCompanionSyncObjects).not.toHaveBeenCalled();
}

async function testKeepsCurrentSettingsOnMalformedPayload() {
  const current = createSettings({ desiredRetention: 0.84 });
  hydrateCurrentReviewSchedulerSettings(current);
  const object = settingObject({ valueJson: '{bad-json' });
  syncObjectsMock.loadCompanionSyncIndex.mockResolvedValue([
    { object_id: object.object_id, object_type: 'setting' }
  ]);
  syncObjectsMock.loadCompanionSyncObjects.mockResolvedValue([object]);
  const api = await import('./companionReviewSchedulerSettingsHydration');

  await expect(api.hydrateCompanionReviewSchedulerSettings()).resolves.toEqual({
    settings: DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    status: 'failed'
  });
  expect(getCurrentReviewSchedulerSettings()).toEqual(current);
}

describe('companion review scheduler settings hydration', () => {
  beforeEach(() => {
    syncObjectsMock.loadCompanionSyncIndex.mockReset();
    syncObjectsMock.loadCompanionSyncObjects.mockReset();
    hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  });

  it('hydrates review scheduler settings from synced user-space setting objects', testHydratesSyncedSettings);
  it('selects the latest valid user-space scheduler setting record', testSelectsLatestSyncedSettings);
  it('uses defaults when no synced scheduler setting exists', testUsesDefaultsWithoutSyncedSettings);
  it('does not overwrite current settings when synced scheduler payload is malformed', testKeepsCurrentSettingsOnMalformedPayload);
});
