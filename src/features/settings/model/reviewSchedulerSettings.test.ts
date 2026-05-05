import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../../shared/platform/bridge';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  loadReviewSchedulerSettings,
  saveReviewSchedulerSettings
} from './reviewSchedulerSettings';

vi.mock('../../../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createSettings(overrides?: Partial<(typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS)>) {
  return {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    ...overrides
  };
}

function expectSavedPayload(invoke: ReturnType<typeof vi.fn>, settings: Record<string, unknown>) {
  expect(invoke).toHaveBeenLastCalledWith('save_review_scheduler_settings', {
    settings
  });
}

function createInvokeSequence(...results: Array<Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS>>) {
  return results.reduce(
    (mock, result) => mock.mockResolvedValueOnce(createSettings(result)),
    vi.fn()
  );
}

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('loads defaults when runtime invoke is unavailable', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);

  await expect(loadReviewSchedulerSettings()).resolves.toEqual(
    DEFAULT_REVIEW_SCHEDULER_SETTINGS
  );
});

it('saves the full scheduler settings payload through the native command', async () => {
  const invoke = createInvokeSequence(
    {
      desiredRetention: 0.91,
      maximumIntervalDays: 365,
      updatedAt: '2026-03-13T00:00:00.000Z'
    },
    {
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true,
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  );
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(
    saveReviewSchedulerSettings({
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true
    })
  ).resolves.toMatchObject({
    desiredRetention: 0.83,
    maximumIntervalDays: 120,
    enableFuzz: true,
    enableShortTerm: true
  });

  expectSavedPayload(
    invoke,
    createSettings({
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true,
      updatedAt: '2026-03-13T00:00:00.000Z'
    })
  );
});

it('preserves previously loaded values during partial saves', async () => {
  const invoke = createInvokeSequence(
    {
      desiredRetention: 0.86,
      maximumIntervalDays: 240,
      enableFuzz: true,
      enableShortTerm: true,
      updatedAt: '2026-03-13T00:00:00.000Z'
    },
    {
      desiredRetention: 0.84,
      maximumIntervalDays: 240,
      enableFuzz: true,
      enableShortTerm: true,
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  );
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await saveReviewSchedulerSettings({ desiredRetention: 0.84 });

  expectSavedPayload(
    invoke,
    createSettings({
      desiredRetention: 0.84,
      maximumIntervalDays: 240,
      enableFuzz: true,
      enableShortTerm: true,
      updatedAt: '2026-03-13T00:00:00.000Z'
    })
  );
});
