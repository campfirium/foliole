import { interleaveMaterialHierarchy } from './hierarchicalMaterialInterleave.js';
import { DEFAULT_UNIFIED_PUSH_QUEUE_RULES } from './unifiedPushQueueRules.js';

export interface ReadingMaterialDispersionEntry {
  dueAt?: string;
  nextAt?: string;
  id?: string;
  intervalDurationMs?: number | null | undefined;
  pathNodeIds?: readonly string[];
}

export interface ReadingMaterialDispersionOptions {
  readingInitialIntervalMs?: number;
  now: string;
  timestamp?: (value: string) => number;
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

function preparePressureOrder<T extends ReadingMaterialDispersionEntry>(entries: readonly T[],
  options: ReadingMaterialDispersionOptions) {
  const timestamp = options.timestamp ?? parseTimestamp;
  const nowMs = timestamp(options.now);
  const initial = options.readingInitialIntervalMs ?? DEFAULT_UNIFIED_PUSH_QUEUE_RULES.readingInitialIntervalMs;
  if (entries.length < 2) return [...entries];
  const prepared = entries.map(entry => {
    const dueAt = entry.dueAt ? timestamp(entry.dueAt) : null;
    return { entry, dueAt, pressure: dueAt === null ? 0
      : Math.max(0, nowMs - dueAt) / resolveEffectiveIntervalMs(entry, initial),
    nextAt: entry.nextAt === undefined ? null : timestamp(entry.nextAt) };
  });
  prepared.sort((left, right) => {
    const overdue = right.pressure - left.pressure;
    if (overdue !== 0) return overdue;
    const dueAt = (left.dueAt ?? timestamp('')) - (right.dueAt ?? timestamp(''));
    if (dueAt !== 0) return dueAt;
    const path = comparePathNodeIds(left.entry.pathNodeIds, right.entry.pathNodeIds);
    if (path !== 0) return path;
    const id = (left.entry.id ?? '').localeCompare(right.entry.id ?? '');
    if (id !== 0) return id;
    // Preserve the effective stable order of the former nextAt pre-sort.
    return left.nextAt === null || right.nextAt === null ? 0 : left.nextAt - right.nextAt;
  });
  return prepared.map(value => value.entry);
}

export function disperseReadingMaterial<T extends ReadingMaterialDispersionEntry>(
  entries: readonly T[],
  options: ReadingMaterialDispersionOptions
) {
  return interleaveMaterialHierarchy(preparePressureOrder(entries, options));
}

export function disperseOrderedMaterial<T extends OrderedMaterialDispersionEntry>(
  entries: readonly T[]
) {
  return interleaveMaterialHierarchy(entries);
}
