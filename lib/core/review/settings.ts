import { generatorParameters } from 'ts-fsrs';

import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  normalizeUnifiedPushQueueRules,
  type UnifiedPushQueueRules,
  type UnifiedPushQueueRulesPatch
} from './unifiedPushQueueRules.js';

const REVIEW_SCHEDULER_ALGORITHM = 'ts-fsrs@4.3.0';

export interface ReviewSchedulerSettings {
  algorithm: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  pushQueue: UnifiedPushQueueRules;
  updatedAt: string;
}

export interface ReviewSchedulerSettingsSavePatch {
  desiredRetention?: number;
  maximumIntervalDays?: number;
  enableFuzz?: boolean;
  enableShortTerm?: boolean;
  pushQueue?: UnifiedPushQueueRulesPatch;
}

export const PUSH_QUEUE_SETTINGS_SCOPE = Object.freeze({
  priority: 'node-inherited',
  defaultPriority: 'global-fallback',
  priorityRatio: 'global',
  queueMixRatio: 'global',
  readingInitialIntervalMs: 'global',
  readingIntervalGrowthFactorRange: 'global'
});

export const DEFAULT_REVIEW_SCHEDULER_SETTINGS: ReviewSchedulerSettings = {
  algorithm: REVIEW_SCHEDULER_ALGORITHM,
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableFuzz: false,
  enableShortTerm: false,
  pushQueue: DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
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

function normalizePositiveInteger(value: unknown, fallback: number) {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : fallback;
}

export function mergeReviewSchedulerPushQueueSettings(base: UnifiedPushQueueRules, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return normalizeUnifiedPushQueueRules(base);
  }

  const patch = value as Record<string, unknown>;
  return normalizeUnifiedPushQueueRules({
    ...base,
    ...patch,
    queueMixRatio: {
      ...base.queueMixRatio,
      ...(patch.queueMixRatio && typeof patch.queueMixRatio === 'object' && !Array.isArray(patch.queueMixRatio)
        ? (patch.queueMixRatio as Record<string, unknown>)
        : {})
    },
    readingIntervalGrowthFactorRange: {
      ...base.readingIntervalGrowthFactorRange,
      ...(patch.readingIntervalGrowthFactorRange &&
      typeof patch.readingIntervalGrowthFactorRange === 'object' &&
      !Array.isArray(patch.readingIntervalGrowthFactorRange)
        ? (patch.readingIntervalGrowthFactorRange as Record<string, unknown>)
        : {})
    }
  });
}

export function normalizeReviewSchedulerSettings(payload: unknown): ReviewSchedulerSettings {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }

  const value = payload as Record<string, unknown>;
  return {
    algorithm:
      typeof value.algorithm === 'string' && value.algorithm.trim().length > 0
        ? value.algorithm
        : REVIEW_SCHEDULER_ALGORITHM,
    desiredRetention: clampDesiredRetention(value.desiredRetention),
    maximumIntervalDays: normalizePositiveInteger(
      value.maximumIntervalDays,
      DEFAULT_REVIEW_SCHEDULER_SETTINGS.maximumIntervalDays
    ),
    enableFuzz:
      typeof value.enableFuzz === 'boolean'
        ? value.enableFuzz
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableFuzz,
    enableShortTerm:
      typeof value.enableShortTerm === 'boolean'
        ? value.enableShortTerm
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.enableShortTerm,
    pushQueue: mergeReviewSchedulerPushQueueSettings(
      DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue,
      value.pushQueue
    ),
    updatedAt:
      typeof value.updatedAt === 'string' && value.updatedAt.trim().length > 0
        ? value.updatedAt
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.updatedAt
  };
}

export function mergeReviewSchedulerSettingsPatch(
  base: ReviewSchedulerSettings,
  patch: ReviewSchedulerSettingsSavePatch & { updatedAt?: string }
): ReviewSchedulerSettings {
  return normalizeReviewSchedulerSettings({
    ...base,
    ...patch,
    pushQueue: mergeReviewSchedulerPushQueueSettings(base.pushQueue, patch.pushQueue),
    algorithm: REVIEW_SCHEDULER_ALGORITHM
  });
}

export function createReviewSchedulerParameters(settings: ReviewSchedulerSettings) {
  return generatorParameters({
    request_retention: settings.desiredRetention,
    maximum_interval: settings.maximumIntervalDays,
    enable_fuzz: settings.enableFuzz,
    enable_short_term: settings.enableShortTerm
  });
}

export function getReviewSchedulerSettingsSignature(settings: ReviewSchedulerSettings) {
  return [
    settings.algorithm,
    settings.desiredRetention.toFixed(2),
    settings.maximumIntervalDays,
    settings.enableFuzz ? '1' : '0',
    settings.enableShortTerm ? '1' : '0',
    settings.pushQueue.defaultPriority,
    settings.pushQueue.priorityRatio.toFixed(2),
    `${settings.pushQueue.queueMixRatio.reading}:${settings.pushQueue.queueMixRatio.fsrs}`,
    settings.pushQueue.readingInitialIntervalMs,
    `${settings.pushQueue.readingIntervalGrowthFactorRange.min.toFixed(2)}-${settings.pushQueue.readingIntervalGrowthFactorRange.max.toFixed(2)}`
  ].join('|');
}

export function getReviewSchedulerVersion(settings: ReviewSchedulerSettings) {
  return [
    settings.algorithm,
    `dr=${settings.desiredRetention.toFixed(2)}`,
    `mi=${settings.maximumIntervalDays}`,
    `fz=${settings.enableFuzz ? '1' : '0'}`,
    `st=${settings.enableShortTerm ? '1' : '0'}`,
    `pqdp=${settings.pushQueue.defaultPriority}`,
    `pqpr=${settings.pushQueue.priorityRatio.toFixed(2)}`,
    `pqmx=${settings.pushQueue.queueMixRatio.reading}:${settings.pushQueue.queueMixRatio.fsrs}`,
    `pqii=${settings.pushQueue.readingInitialIntervalMs}`,
    `pqgr=${settings.pushQueue.readingIntervalGrowthFactorRange.min.toFixed(2)}-${settings.pushQueue.readingIntervalGrowthFactorRange.max.toFixed(2)}`
  ].join('|');
}
