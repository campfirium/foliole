import { getRuntimeInvoke } from '../../../shared/platform/bridge';

export interface ReviewSchedulerSettings {
  algorithm: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  updatedAt: string;
}

export const DEFAULT_REVIEW_SCHEDULER_SETTINGS: ReviewSchedulerSettings = {
  algorithm: 'ts-fsrs@4.3.0',
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableFuzz: false,
  enableShortTerm: false,
  updatedAt: '1970-01-01T00:00:00.000Z'
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampDesiredRetention(value: unknown) {
  if (!isFiniteNumber(value)) {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS.desiredRetention;
  }
  return Math.min(0.99, Math.max(0.01, Number(value.toFixed(2))));
}

export function normalizeReviewSchedulerSettings(value: unknown): ReviewSchedulerSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }
  const payload = value as Record<string, unknown>;
  return {
    algorithm:
      typeof payload.algorithm === 'string' && payload.algorithm.trim().length > 0
        ? payload.algorithm
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.algorithm,
    desiredRetention: clampDesiredRetention(payload.desiredRetention),
    maximumIntervalDays:
      isFiniteNumber(payload.maximumIntervalDays) && payload.maximumIntervalDays > 0
        ? Math.round(payload.maximumIntervalDays)
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.maximumIntervalDays,
    enableFuzz:
      typeof payload.enableFuzz === 'boolean'
        ? payload.enableFuzz
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableFuzz,
    enableShortTerm:
      typeof payload.enableShortTerm === 'boolean'
        ? payload.enableShortTerm
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableShortTerm,
    updatedAt:
      typeof payload.updatedAt === 'string' && payload.updatedAt.trim().length > 0
        ? payload.updatedAt
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.updatedAt
  };
}

export async function loadReviewSchedulerSettings(): Promise<ReviewSchedulerSettings> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }
  try {
    return normalizeReviewSchedulerSettings(await runtimeInvoke('load_review_scheduler_settings'));
  } catch {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }
}

export async function saveReviewSchedulerSettings(
  settings: Pick<ReviewSchedulerSettings, 'desiredRetention'>
): Promise<ReviewSchedulerSettings> {
  const runtimeInvoke = getRuntimeInvoke();
  const payload = {
    ...DEFAULT_REVIEW_SCHEDULER_SETTINGS,
    ...settings
  };
  if (!runtimeInvoke) {
    return normalizeReviewSchedulerSettings(payload);
  }
  try {
    return normalizeReviewSchedulerSettings(
      await runtimeInvoke('save_review_scheduler_settings', {
        settings: payload
      })
    );
  } catch {
    return normalizeReviewSchedulerSettings(payload);
  }
}
