import { interleaveMaterialHierarchy } from './hierarchicalMaterialInterleave.js';
import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from './unifiedPushQueueRules.js';

export interface ReadingMaterialDispersionEntry {
  dueAt?: string;
  id?: string;
  intervalDurationMs?: number | null | undefined;
  pathNodeIds?: readonly string[];
}

export interface ReadingMaterialDispersionOptions {
  readingInitialIntervalMs?: number;
  now: string;
}

export type OrderedMaterialDispersionEntry = Pick<ReadingMaterialDispersionEntry, 'id' | 'pathNodeIds'>;

export type OrderedMaterialDispersionOptions = Record<string, never>;

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

export function disperseReadingMaterial<T extends ReadingMaterialDispersionEntry>(
  entries: readonly T[],
  options: ReadingMaterialDispersionOptions
) {
  const initialIntervalMs = options.readingInitialIntervalMs ?? DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingInitialIntervalMs;
  const nowMs = parseTimestamp(options.now);
  const pressureOrdered = [...entries].sort(compareMaterialPressure(nowMs, initialIntervalMs));
  return interleaveMaterialHierarchy(pressureOrdered);
}

export function disperseOrderedMaterial<T extends OrderedMaterialDispersionEntry>(
  entries: readonly T[]
) {
  return interleaveMaterialHierarchy(entries);
}
