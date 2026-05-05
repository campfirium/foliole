export const PUSH_QUEUE_PRIORITIES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const REGULAR_PUSH_QUEUE_PRIORITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type PushQueuePriority = (typeof PUSH_QUEUE_PRIORITIES)[number];
export type RegularPushQueuePriority = (typeof REGULAR_PUSH_QUEUE_PRIORITIES)[number];
export type PushQueueKind = 'reading' | 'fsrs';

export interface PushQueueMixRatio {
  reading: number;
  fsrs: number;
}

export interface ReadingIntervalGrowthFactorRange {
  min: number;
  max: number;
}

export interface ReadingScheduleCoreFields {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: RegularPushQueuePriority;
  repetitionCount: number;
}

export interface UnifiedPushQueueRules {
  defaultPriority: RegularPushQueuePriority;
  priorityRatio: number;
  queueMixRatio: PushQueueMixRatio;
  readingInitialIntervalMs: number;
  readingIntervalGrowthFactorRange: ReadingIntervalGrowthFactorRange;
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

function parseTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
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

export function getPriorityWeight(
  priority: RegularPushQueuePriority,
  priorityRatio = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.priorityRatio
) {
  const ratio = normalizePriorityRatio(priorityRatio);
  const alpha = Math.log(ratio) / Math.log(9);
  return (10 - priority) ** alpha;
}

export function getReadingIntervalGrowthFactor(
  priority: RegularPushQueuePriority,
  range = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingIntervalGrowthFactorRange
) {
  const normalizedRange = normalizeReadingIntervalGrowthFactorRange(range);
  const mapped =
    normalizedRange.min +
    ((priority - 1) * (normalizedRange.max - normalizedRange.min)) / 8;
  return roundToTwoDecimals(mapped);
}

export function buildQueueMixCycle(
  ratio = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.queueMixRatio
): PushQueueKind[] {
  const normalizedRatio = normalizePushQueueMixRatio(ratio);
  return [
    ...Array.from({ length: normalizedRatio.fsrs }, () => 'fsrs' as const),
    ...Array.from({ length: normalizedRatio.reading }, () => 'reading' as const)
  ];
}

export function resolveReadingNextAt(lastHandledAt: string, intervalDurationMs: number) {
  const lastHandledAtMs = parseTimestamp(lastHandledAt);
  if (!isFiniteNumber(intervalDurationMs) || intervalDurationMs < 0) {
    throw new TypeError(`Invalid interval duration: ${intervalDurationMs}`);
  }
  return new Date(lastHandledAtMs + intervalDurationMs).toISOString();
}

export function buildReadingScheduleCoreFields(args: {
  intervalDurationMs: number;
  lastHandledAt: string;
  priorityChain?: readonly unknown[];
  repetitionCount: number;
  range?: ReadingIntervalGrowthFactorRange;
}): ReadingScheduleCoreFields {
  const priority = resolveInheritedRegularPushQueuePriority(args.priorityChain ?? []);
  return {
    intervalDurationMs: args.intervalDurationMs,
    intervalGrowthFactor: getReadingIntervalGrowthFactor(priority, args.range),
    lastHandledAt: args.lastHandledAt,
    nextAt: resolveReadingNextAt(args.lastHandledAt, args.intervalDurationMs),
    priority,
    repetitionCount: args.repetitionCount
  };
}

export function compareReadingNextAtAscending(
  left: Pick<{ nextAt: string }, 'nextAt'>,
  right: Pick<{ nextAt: string }, 'nextAt'>
) {
  return parseTimestamp(left.nextAt) - parseTimestamp(right.nextAt);
}
