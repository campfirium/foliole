import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from './unifiedPushQueueRules';

export interface ReadingMaterialDispersionEntry {
  dueAt?: string;
  id?: string;
  intervalDurationMs?: number | null | undefined;
  pathNodeIds?: readonly string[];
}

export interface ReadingMaterialDispersionOptions {
  batchSize?: number;
  readingInitialIntervalMs?: number;
  now: string;
}

const DEFAULT_BATCH_SIZE = 20;

function parseTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function resolveMaterialStride(length: number) {
  if (length === 2) return 1;
  if (length === 3) return 2;
  for (let candidate = length - 1; candidate > 0; candidate -= 1) {
    if (candidate % 2 === 1 && greatestCommonDivisor(candidate, length) === 1) {
      return candidate;
    }
  }
  return 1;
}

function comparePathNodeIds(left: readonly string[] = [], right: readonly string[] = []) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const compared = (left[index] ?? '').localeCompare(right[index] ?? '');
    if (compared !== 0) return compared;
  }
  return left.length - right.length;
}

function resolveEffectiveIntervalMs(entry: ReadingMaterialDispersionEntry, initialIntervalMs: number) {
  const interval = entry.intervalDurationMs;
  return isPositiveFiniteNumber(interval) && interval >= initialIntervalMs ? interval : initialIntervalMs;
}

function resolveRelativeOverdue(entry: ReadingMaterialDispersionEntry, nowMs: number, initialIntervalMs: number) {
  if (!entry.dueAt) return 0;
  const overdueMs = Math.max(0, nowMs - parseTimestamp(entry.dueAt));
  return overdueMs / resolveEffectiveIntervalMs(entry, initialIntervalMs);
}

function compareMaterialPressure<T extends ReadingMaterialDispersionEntry>(nowMs: number, initialIntervalMs: number) {
  return (left: T, right: T) => {
    const overdue = resolveRelativeOverdue(right, nowMs, initialIntervalMs) - resolveRelativeOverdue(left, nowMs, initialIntervalMs);
    if (overdue !== 0) return overdue;
    const dueAt = parseTimestamp(left.dueAt ?? '') - parseTimestamp(right.dueAt ?? '');
    if (dueAt !== 0) return dueAt;
    const path = comparePathNodeIds(left.pathNodeIds, right.pathNodeIds);
    if (path !== 0) return path;
    return (left.id ?? '').localeCompare(right.id ?? '');
  };
}

function compareMaterialPath<T extends ReadingMaterialDispersionEntry>(left: T, right: T) {
  const path = comparePathNodeIds(left.pathNodeIds, right.pathNodeIds);
  if (path !== 0) return path;
  return (left.id ?? '').localeCompare(right.id ?? '');
}

function strideMaterialBatch<T>(entries: readonly T[]) {
  if (entries.length <= 1) return [...entries];
  if (entries.length === 2) return [entries[1]!, entries[0]!];
  const stride = resolveMaterialStride(entries.length);
  const queue: T[] = [];
  let index = 0;
  for (let count = 0; count < entries.length; count += 1) {
    queue.push(entries[index]!);
    index = (index + stride) % entries.length;
  }
  return queue;
}

export function disperseReadingMaterial<T extends ReadingMaterialDispersionEntry>(
  entries: readonly T[],
  options: ReadingMaterialDispersionOptions
) {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const initialIntervalMs = options.readingInitialIntervalMs ?? DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingInitialIntervalMs;
  const nowMs = parseTimestamp(options.now);
  const pressureOrdered = [...entries].sort(compareMaterialPressure(nowMs, initialIntervalMs));
  const queue: T[] = [];

  for (let index = 0; index < pressureOrdered.length; index += batchSize) {
    const batch = pressureOrdered.slice(index, index + batchSize).sort(compareMaterialPath);
    queue.push(...strideMaterialBatch(batch));
  }

  return queue;
}
