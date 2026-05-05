import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../../shared/platform/bridge';

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  PUSH_QUEUE_SETTINGS_SCOPE,
  getCurrentReviewSchedulerSettings,
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

function createPushQueueSettings(overrides?: Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue>) {
  return {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
    ...overrides
  };
}

function createPushQueuePatch() {
  return {
    priorityRatio: 7,
    queueMixRatio: { reading: 2, fsrs: 4 },
    readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
  };
}

function createExpectedSavedSettings(
  overrides?: Partial<Omit<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS, 'pushQueue'>> & {
    pushQueue?: Partial<typeof DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue>;
  }
) {
  return createSettings({
    ...overrides,
    pushQueue: createPushQueueSettings(overrides?.pushQueue)
  });
}

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('loads defaults when runtime invoke is unavailable', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);

  await expect(loadReviewSchedulerSettings()).resolves.toEqual(
    DEFAULT_REVIEW_SCHEDULER_SETTINGS
  );
  expect(getCurrentReviewSchedulerSettings()).toEqual(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
});

it('hydrates the current settings snapshot with persisted push queue rules', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(
    createInvokeSequence({
      pushQueue: {
        ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
        defaultPriority: 6,
        priorityRatio: 7,
        queueMixRatio: { reading: 2, fsrs: 4 },
        readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
      }
    })
  );

  await loadReviewSchedulerSettings();

  expect(getCurrentReviewSchedulerSettings().pushQueue).toEqual({
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
    defaultPriority: 6,
    priorityRatio: 7,
    queueMixRatio: { reading: 2, fsrs: 4 },
    readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
  });
  expect(PUSH_QUEUE_SETTINGS_SCOPE).toEqual({
    priority: 'node-inherited',
    defaultPriority: 'global-fallback',
    priorityRatio: 'global',
    queueMixRatio: 'global',
    readingInitialIntervalMs: 'global',
    readingIntervalGrowthFactorRange: 'global'
  });
});

it('saves the full scheduler settings payload through the native command', async () => {
  const pushQueuePatch = createPushQueuePatch();
  const invoke = createInvokeSequence(
    {
      desiredRetention: 0.91,
      maximumIntervalDays: 365,
      pushQueue: createPushQueueSettings(),
      updatedAt: '2026-03-13T00:00:00.000Z'
    },
    {
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true,
      pushQueue: createPushQueueSettings(pushQueuePatch),
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  );
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await expect(
    saveReviewSchedulerSettings({
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true,
      pushQueue: pushQueuePatch
    })
  ).resolves.toMatchObject({
    desiredRetention: 0.83,
    maximumIntervalDays: 120,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: pushQueuePatch
  });

  expectSavedPayload(
    invoke,
    createExpectedSavedSettings({
      desiredRetention: 0.83,
      maximumIntervalDays: 120,
      enableFuzz: true,
      enableShortTerm: true,
      pushQueue: pushQueuePatch,
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
      pushQueue: {
        defaultPriority: 5,
        priorityRatio: 6,
        queueMixRatio: { reading: 2, fsrs: 6 },
        readingInitialIntervalMs: 24 * 60 * 60 * 1000,
        readingIntervalGrowthFactorRange: { min: 1.09, max: 1.47 }
      },
      updatedAt: '2026-03-13T00:00:00.000Z'
    },
    {
      desiredRetention: 0.84,
      maximumIntervalDays: 240,
      enableFuzz: true,
      enableShortTerm: true,
      pushQueue: {
        defaultPriority: 5,
        priorityRatio: 6,
        queueMixRatio: { reading: 2, fsrs: 6 },
        readingInitialIntervalMs: 24 * 60 * 60 * 1000,
        readingIntervalGrowthFactorRange: { min: 1.12, max: 1.47 }
      },
      updatedAt: '2026-03-14T00:00:00.000Z'
    }
  );
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await saveReviewSchedulerSettings({
    desiredRetention: 0.84,
    pushQueue: {
      readingIntervalGrowthFactorRange: { min: 1.12 }
    }
  });

  expectSavedPayload(
    invoke,
    createSettings({
      desiredRetention: 0.84,
      maximumIntervalDays: 240,
      enableFuzz: true,
      enableShortTerm: true,
      pushQueue: {
        ...DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
        priorityRatio: 6,
        queueMixRatio: { reading: 2, fsrs: 6 },
        readingIntervalGrowthFactorRange: { min: 1.12, max: 1.47 }
      },
      updatedAt: '2026-03-13T00:00:00.000Z'
    })
  );
});

it('rehydrates persisted push queue rules after saving and restarting settings state', async () => {
  const persistedSettings = createExpectedSavedSettings({
    desiredRetention: 0.81,
    pushQueue: {
      defaultPriority: 4,
      priorityRatio: 8,
      queueMixRatio: { reading: 2, fsrs: 3 },
      readingInitialIntervalMs: 2 * 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.12, max: 1.41 }
    },
    updatedAt: '2026-03-14T03:00:00.000Z'
  });
  const invoke = createInvokeSequence(
    createSettings({
      updatedAt: '2026-03-14T02:00:00.000Z'
    }),
    persistedSettings,
    persistedSettings
  );
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  await saveReviewSchedulerSettings({
    desiredRetention: 0.81,
    pushQueue: {
      defaultPriority: 4,
      priorityRatio: 8,
      queueMixRatio: { reading: 2, fsrs: 3 },
      readingInitialIntervalMs: 2 * 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.12, max: 1.41 }
    }
  });

  await expect(loadReviewSchedulerSettings()).resolves.toEqual(persistedSettings);
  expect(getCurrentReviewSchedulerSettings()).toEqual(persistedSettings);
});
