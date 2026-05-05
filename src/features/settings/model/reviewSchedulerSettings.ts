import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  normalizeUnifiedPushQueueRules,
  type UnifiedPushQueueRules,
  type UnifiedPushQueueRulesPatch
} from '../../../../lib/core/review/unifiedPushQueueRules';
import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../../../shared/platform/bridge';

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

export const DEFAULT_REVIEW_SCHEDULER_SETTINGS: ReviewSchedulerSettings = {
  algorithm: 'ts-fsrs@4.3.0',
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

function mergePushQueueSettings(base: UnifiedPushQueueRules, value: unknown) {
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
    pushQueue: mergePushQueueSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue, payload.pushQueue),
    updatedAt:
      typeof payload.updatedAt === 'string' && payload.updatedAt.trim().length > 0
        ? payload.updatedAt
        : DEFAULT_REVIEW_SCHEDULER_SETTINGS.updatedAt
  };
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

export async function loadReviewSchedulerSettings(): Promise<ReviewSchedulerSettings> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }
  try {
    return normalizeReviewSchedulerSettings(await runtimeInvoke(NATIVE_COMMANDS.loadReviewSchedulerSettings));
  } catch {
    return DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  }
}

export async function saveReviewSchedulerSettings(
  settings: ReviewSchedulerSettingsSavePatch
): Promise<ReviewSchedulerSettings> {
  const runtimeInvoke = getRuntimeInvoke();
  const baseSettings = runtimeInvoke
    ? await loadReviewSchedulerSettings()
    : DEFAULT_REVIEW_SCHEDULER_SETTINGS;
  const payload = normalizeReviewSchedulerSettings({
    ...baseSettings,
    ...settings,
    pushQueue: mergePushQueueSettings(baseSettings.pushQueue, settings.pushQueue)
  });
  if (!runtimeInvoke) {
    return payload;
  }
  try {
    return normalizeReviewSchedulerSettings(
      await runtimeInvoke(NATIVE_COMMANDS.saveReviewSchedulerSettings, {
        settings: payload
      })
    );
  } catch {
    return normalizeReviewSchedulerSettings(payload);
  }
}
