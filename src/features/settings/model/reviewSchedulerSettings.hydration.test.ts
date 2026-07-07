import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../../shared/platform/runtimeInvoke';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getCurrentReviewSchedulerSettings,
  hydrateCurrentReviewSchedulerSettings,
  loadReviewSchedulerSettings
} from './reviewSchedulerSettings';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createSettings(overrides?: Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS>) {
  return {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    ...overrides
  };
}

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
  hydrateCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

it('keeps companion-hydrated settings when runtime invoke is unavailable', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  const hydrated = createSettings({
    desiredRetention: 0.82,
    newDayStartsAtHour: 7,
    updatedAt: '2026-04-22T08:00:00.000Z'
  });

  expect(hydrateCurrentReviewSchedulerSettings(hydrated)).toEqual(hydrated);

  await expect(loadReviewSchedulerSettings()).resolves.toEqual(hydrated);
  expect(getCurrentReviewSchedulerSettings()).toEqual(hydrated);
});

it('rejects invalid companion hydration payloads without changing current settings', () => {
  const hydrated = createSettings({
    desiredRetention: 0.82,
    updatedAt: '2026-04-22T08:00:00.000Z'
  });

  hydrateCurrentReviewSchedulerSettings(hydrated);

  expect(hydrateCurrentReviewSchedulerSettings('bad')).toBeNull();
  expect(getCurrentReviewSchedulerSettings()).toEqual(hydrated);
});
