export const PUSH_QUEUE_PRIORITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const REGULAR_PUSH_QUEUE_PRIORITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type PushQueuePriority = (typeof PUSH_QUEUE_PRIORITIES)[number];
export type RegularPushQueuePriority = (typeof REGULAR_PUSH_QUEUE_PRIORITIES)[number];
export type PushQueueKind = 'reading' | 'fsrs';

export interface PushQueueMixRatio {
  reading: number;
  fsrs: number;
}

export interface PushQueueMixRatioPatch {
  reading?: number;
  fsrs?: number;
}

export interface ReadingIntervalGrowthFactorRange {
  min: number;
  max: number;
}

export interface ReadingIntervalGrowthFactorRangePatch {
  min?: number;
  max?: number;
}

export interface UnifiedPushQueueRules {
  defaultPriority: RegularPushQueuePriority;
  priorityRatio: number;
  queueMixRatio: PushQueueMixRatio;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorRange: ReadingIntervalGrowthFactorRange;
}

export interface UnifiedPushQueueRulesPatch {
  defaultPriority?: number;
  priorityRatio?: number;
  queueMixRatio?: PushQueueMixRatioPatch;
  readingInitialIntervalMs?: number;
  readingIntervalGrowthFactorRange?: ReadingIntervalGrowthFactorRangePatch;
}

const DEFAULT_QUEUE_MIX_RATIO = Object.freeze({ reading: 1, fsrs: 5 });
const DEFAULT_GROWTH_FACTOR_RANGE = Object.freeze({ min: 1.1, max: 1.5 });

export const DEFAULT_UNIFIED_PUSH_QUEUE_RULES: UnifiedPushQueueRules = Object.freeze({
  defaultPriority: 5,
  priorityRatio: 5,
  queueMixRatio: DEFAULT_QUEUE_MIX_RATIO,
  readingInitialIntervalMs: 24 * 60 * 60 * 1000,
  readingIntervalGrowthFactorRange: DEFAULT_GROWTH_FACTOR_RANGE
});

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundToTwoDecimals(value: number) {
  return Number(value.toFixed(2));
}

export function normalizePushQueuePriority(
  value: unknown,
  fallback: PushQueuePriority = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority
): PushQueuePriority {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return 0;
  }
  if (rounded >= 9) {
    return 9;
  }
  return rounded as PushQueuePriority;
}

export function normalizeRegularPushQueuePriority(
  value: unknown,
  fallback: RegularPushQueuePriority = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority
): RegularPushQueuePriority {
  const priority = normalizePushQueuePriority(value, fallback);
  return priority === 0 ? fallback : priority;
}

export function resolveInheritedPushQueuePriority(
  priorityChain: readonly unknown[],
  fallback: PushQueuePriority = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority
): PushQueuePriority {
  for (const candidate of priorityChain) {
    if (candidate !== null && candidate !== undefined) {
      return normalizePushQueuePriority(candidate, fallback);
    }
  }
  return fallback;
}

export function resolveInheritedRegularPushQueuePriority(
  priorityChain: readonly unknown[],
  fallback: RegularPushQueuePriority = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority
): RegularPushQueuePriority {
  const priority = resolveInheritedPushQueuePriority(priorityChain, fallback);
  return priority === 0 ? fallback : priority;
}

export function normalizePriorityRatio(value: unknown) {
  if (!isFiniteNumber(value) || value < 1) {
    return DEFAULT_UNIFIED_PUSH_QUEUE_RULES.priorityRatio;
  }
  return roundToTwoDecimals(value);
}

export function normalizePushQueueMixRatio(value: unknown): PushQueueMixRatio {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_UNIFIED_PUSH_QUEUE_RULES.queueMixRatio;
  }
  const payload = value as Record<string, unknown>;
  const reading = isFiniteNumber(payload.reading) && payload.reading > 0 ? Math.round(payload.reading) : 1;
  const fsrs = isFiniteNumber(payload.fsrs) && payload.fsrs > 0 ? Math.round(payload.fsrs) : 5;
  return { reading, fsrs };
}

export function normalizeReadingIntervalGrowthFactorRange(
  value: unknown
): ReadingIntervalGrowthFactorRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingIntervalGrowthFactorRange;
  }
  const payload = value as Record<string, unknown>;
  const min = isFiniteNumber(payload.min) && payload.min >= 1 ? roundToTwoDecimals(payload.min) : 1.1;
  const maxCandidate =
    isFiniteNumber(payload.max) && payload.max >= min ? roundToTwoDecimals(payload.max) : 1.5;
  return {
    min,
    max: maxCandidate < min ? min : maxCandidate
  };
}

export function normalizeUnifiedPushQueueRules(value: unknown): UnifiedPushQueueRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_UNIFIED_PUSH_QUEUE_RULES;
  }
  const payload = value as Record<string, unknown>;
  return {
    defaultPriority: normalizeRegularPushQueuePriority(payload.defaultPriority),
    priorityRatio: normalizePriorityRatio(payload.priorityRatio),
    queueMixRatio: normalizePushQueueMixRatio(payload.queueMixRatio),
    readingInitialIntervalMs:
      isFiniteNumber(payload.readingInitialIntervalMs) && payload.readingInitialIntervalMs > 0
        ? Math.round(payload.readingInitialIntervalMs)
        : DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingInitialIntervalMs,
    readingIntervalGrowthFactorRange: normalizeReadingIntervalGrowthFactorRange(
      payload.readingIntervalGrowthFactorRange
    )
  };
}

export function isAbsolutePushQueuePriority(priority: PushQueuePriority) {
  return priority === 0;
}

export function buildQueueMixCycle(ratio = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.queueMixRatio): PushQueueKind[] {
  const normalizedRatio = normalizePushQueueMixRatio(ratio);
  return [
    ...Array.from({ length: normalizedRatio.fsrs }, () => 'fsrs' as const),
    ...Array.from({ length: normalizedRatio.reading }, () => 'reading' as const)
  ];
}
