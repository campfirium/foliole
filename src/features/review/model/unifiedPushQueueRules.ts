import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  type PushQueueKind,
  type PushQueuePriority,
  type ReadingIntervalGrowthFactorRange,
  type RegularPushQueuePriority,
  buildQueueMixCycle as buildQueueMixCycleBase,
  normalizePriorityRatio,
  normalizeReadingIntervalGrowthFactorRange,
  normalizeRegularPushQueuePriority,
  resolveInheritedPushQueuePriority,
  resolveInheritedRegularPushQueuePriority
} from '../../../../lib/core/review/unifiedPushQueueRules';

export {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  PUSH_QUEUE_PRIORITIES,
  REGULAR_PUSH_QUEUE_PRIORITIES,
  isAbsolutePushQueuePriority,
  normalizePriorityRatio,
  normalizePushQueueMixRatio,
  normalizePushQueuePriority,
  normalizeReadingIntervalGrowthFactorRange,
  normalizeRegularPushQueuePriority,
  normalizeUnifiedPushQueueRules,
  resolveInheritedPushQueuePriority,
  resolveInheritedRegularPushQueuePriority
} from '../../../../lib/core/review/unifiedPushQueueRules';
export type {
  PushQueueKind,
  PushQueueMixRatio,
  PushQueuePriority,
  ReadingIntervalGrowthFactorRange,
  RegularPushQueuePriority,
  UnifiedPushQueueRules
} from '../../../../lib/core/review/unifiedPushQueueRules';

export interface ReadingScheduleCoreFields {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: PushQueuePriority;
  repetitionCount: number;
}

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

export function buildQueueMixCycle(ratio = DEFAULT_UNIFIED_PUSH_QUEUE_RULES.queueMixRatio): PushQueueKind[] {
  return buildQueueMixCycleBase(ratio);
}

export function resolveReadingNextAt(lastHandledAt: string, intervalDurationMs: number) {
  const lastHandledAtMs = parseTimestamp(lastHandledAt);
  if (!isFiniteNumber(intervalDurationMs) || intervalDurationMs < 0) {
    throw new TypeError(`Invalid interval duration: ${intervalDurationMs}`);
  }
  return new Date(lastHandledAtMs + intervalDurationMs).toISOString();
}

export function resolveNextReadingIntervalDurationMs(args: { repetitionCount: number; previousIntervalDurationMs?: number | null; priorityChain?: readonly unknown[]; initialIntervalMs?: number; range?: ReadingIntervalGrowthFactorRange }) {
  if (args.repetitionCount <= 0) {
    return Math.round(args.initialIntervalMs ?? DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingInitialIntervalMs);
  }
  if (!isFiniteNumber(args.previousIntervalDurationMs) || args.previousIntervalDurationMs <= 0) {
    throw new TypeError(`Invalid previous interval duration: ${args.previousIntervalDurationMs}`);
  }
  return Math.round(
    args.previousIntervalDurationMs *
      getReadingIntervalGrowthFactor(resolveInheritedRegularPushQueuePriority(args.priorityChain ?? [], 1), args.range)
  );
}

export function buildReadingScheduleCoreFields(args: { intervalDurationMs: number; lastHandledAt: string; priorityChain?: readonly unknown[]; repetitionCount: number; range?: ReadingIntervalGrowthFactorRange }): ReadingScheduleCoreFields {
  const priority = resolveInheritedPushQueuePriority(args.priorityChain ?? []);
  return {
    intervalDurationMs: args.intervalDurationMs,
    intervalGrowthFactor: getReadingIntervalGrowthFactor(
      normalizeRegularPushQueuePriority(priority, 1),
      args.range
    ),
    lastHandledAt: args.lastHandledAt,
    nextAt: resolveReadingNextAt(args.lastHandledAt, args.intervalDurationMs),
    priority,
    repetitionCount: args.repetitionCount
  };
}

export function advanceReadingScheduleCoreFields(args: { lastHandledAt: string; previousIntervalDurationMs?: number | null; previousRepetitionCount: number; priorityChain?: readonly unknown[]; initialIntervalMs?: number; range?: ReadingIntervalGrowthFactorRange }) {
  const previousRepetitionCount =
    isFiniteNumber(args.previousRepetitionCount) && args.previousRepetitionCount > 0
      ? Math.round(args.previousRepetitionCount)
      : 0;
  return buildReadingScheduleCoreFields({
    intervalDurationMs: resolveNextReadingIntervalDurationMs({
      repetitionCount: previousRepetitionCount,
      ...(args.previousIntervalDurationMs !== undefined ? { previousIntervalDurationMs: args.previousIntervalDurationMs } : {}),
      ...(args.priorityChain ? { priorityChain: args.priorityChain } : {}),
      ...(args.initialIntervalMs !== undefined ? { initialIntervalMs: args.initialIntervalMs } : {}),
      ...(args.range ? { range: args.range } : {})
    }),
    lastHandledAt: args.lastHandledAt,
    ...(args.priorityChain ? { priorityChain: args.priorityChain } : {}),
    repetitionCount: previousRepetitionCount + 1,
    ...(args.range ? { range: args.range } : {})
  });
}

export function compareReadingNextAtAscending(left: Pick<{ nextAt: string }, 'nextAt'>, right: Pick<{ nextAt: string }, 'nextAt'>) {
  return parseTimestamp(left.nextAt) - parseTimestamp(right.nextAt);
}
