import {
  compareReadingNextAtAscending,
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  getPriorityWeight,
  isAbsolutePushQueuePriority,
  normalizePushQueuePriority,
  REGULAR_PUSH_QUEUE_PRIORITIES,
  type PushQueuePriority,
  type RegularPushQueuePriority
} from './unifiedPushQueueRules';

export interface FsrsPushQueueEntry {
  priority: PushQueuePriority;
  retrievability: number;
}

export interface ReadingPushQueueEntry {
  priority: PushQueuePriority;
  nextAt: string;
  sourceId?: string;
  sourceOrder?: number;
}

export interface RouletteSelectionOptions {
  priorityRatio?: number;
  random?: () => number;
}

export type RegularPriorityBuckets<T> = Record<RegularPushQueuePriority, T[]>;

const SOURCE_INTERLEAVE_RATIO = 0.6180339887498949;

function createRegularPriorityBuckets<T>(): RegularPriorityBuckets<T> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
}

function resolveRandomValue(random: (() => number) | undefined) {
  const value = random ? random() : Math.random();
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1 - Number.EPSILON;
  }
  return value;
}

export function compareFsrsForgettingDescending<T extends Pick<FsrsPushQueueEntry, 'retrievability'>>(left: T, right: T) {
  return left.retrievability - right.retrievability;
}

function bucketPriorityQueueEntries<T extends { priority: PushQueuePriority }>(
  entries: readonly T[],
  compareEntries: (left: T, right: T) => number
) {
  const absolute: T[] = [];
  const regular = createRegularPriorityBuckets<T>();

  entries.forEach((entry) => {
    const priority = normalizePushQueuePriority(entry.priority);
    if (isAbsolutePushQueuePriority(priority)) {
      absolute.push(entry);
      return;
    }
    regular[priority].push(entry);
  });

  REGULAR_PUSH_QUEUE_PRIORITIES.forEach((priority) => {
    regular[priority].sort(compareEntries);
  });

  return { absolute, regular };
}

export function bucketFsrsPushQueueEntries<T extends FsrsPushQueueEntry>(entries: readonly T[]) {
  return bucketPriorityQueueEntries(entries, compareFsrsForgettingDescending);
}

export function bucketReadingPushQueueEntries<T extends ReadingPushQueueEntry>(entries: readonly T[]) {
  return bucketPriorityQueueEntries(entries, compareReadingNextAtAscending);
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

function resolveSourceInterleaveStride(length: number) {
  if (length <= 2) {
    return 1;
  }

  const target = Math.min(Math.max(Math.round(length * SOURCE_INTERLEAVE_RATIO), 1), length - 1);
  for (let offset = 0; offset < length; offset += 1) {
    const higher = target + offset;
    if (higher < length && greatestCommonDivisor(higher, length) === 1) {
      return higher;
    }

    const lower = target - offset;
    if (lower > 0 && greatestCommonDivisor(lower, length) === 1) {
      return lower;
    }
  }

  return 1;
}

function interleaveSourceGroup<T>(entries: readonly T[]) {
  if (entries.length <= 2) {
    return [...entries];
  }

  const stride = resolveSourceInterleaveStride(entries.length);
  const queue: T[] = [];
  let index = 0;
  for (let count = 0; count < entries.length; count += 1) {
    const entry = entries[index];
    if (entry !== undefined) {
      queue.push(entry);
    }
    index = (index + stride) % entries.length;
  }
  return queue;
}

function interleaveReadingSourceGroups<T extends ReadingPushQueueEntry>(entries: readonly T[]) {
  if (entries.length <= 2) {
    return [...entries];
  }
  if (entries.some((entry) => !entry.sourceId || !Number.isFinite(entry.sourceOrder))) {
    return [...entries];
  }

  const groups = new Map<string, { entries: Array<T & { sourceOrder: number }>; sourceRank: number }>();
  entries.forEach((entry, index) => {
    const sourceId = entry.sourceId as string;
    const group = groups.get(sourceId) ?? { entries: [], sourceRank: index };
    group.entries.push(entry as T & { sourceOrder: number });
    groups.set(sourceId, group);
  });

  const positionedEntries = Array.from(groups.values()).flatMap((group) => {
    const orderedEntries = [...group.entries].sort((left, right) => left.sourceOrder - right.sourceOrder);
    return interleaveSourceGroup(orderedEntries).map((entry, index) => ({
      entry,
      position: ((index + 1) * entries.length) / (orderedEntries.length + 1),
      sourceRank: group.sourceRank
    }));
  });

  return positionedEntries
    .sort((left, right) => left.position - right.position || left.sourceRank - right.sourceRank)
    .map(({ entry }) => entry);
}

export function selectRouletteBucketPriority<T>(
  buckets: Readonly<RegularPriorityBuckets<T>>,
  options: RouletteSelectionOptions = {}
): RegularPushQueuePriority | null {
  const activePriorities = REGULAR_PUSH_QUEUE_PRIORITIES.filter((priority) => buckets[priority].length > 0);
  if (activePriorities.length === 0) {
    return null;
  }

  const priorityRatio = options.priorityRatio ?? DEFAULT_UNIFIED_PUSH_QUEUE_RULES.priorityRatio;
  const totalWeight = activePriorities.reduce((sum, priority) => sum + getPriorityWeight(priority, priorityRatio), 0);
  let remainingWeight = resolveRandomValue(options.random) * totalWeight;

  for (const priority of activePriorities) {
    remainingWeight -= getPriorityWeight(priority, priorityRatio);
    if (remainingWeight < 0) {
      return priority;
    }
  }

  return activePriorities.at(-1) ?? null;
}

export function assembleRouletteBuckets<T>(
  buckets: Readonly<RegularPriorityBuckets<T>>,
  options: RouletteSelectionOptions = {}
) {
  const workingBuckets = createRegularPriorityBuckets<T>();
  REGULAR_PUSH_QUEUE_PRIORITIES.forEach((priority) => {
    workingBuckets[priority] = [...buckets[priority]];
  });

  const queue: T[] = [];
  while (true) {
    const selectedPriority = selectRouletteBucketPriority(workingBuckets, options);
    if (selectedPriority === null) {
      return queue;
    }

    const nextEntry = workingBuckets[selectedPriority].shift();
    if (nextEntry !== undefined) {
      queue.push(nextEntry);
    }
  }
}

export function assembleFsrsPushQueue<T extends FsrsPushQueueEntry>(
  entries: readonly T[],
  options: RouletteSelectionOptions = {}
) {
  const buckets = bucketFsrsPushQueueEntries(entries);
  return [...buckets.absolute, ...assembleRouletteBuckets(buckets.regular, options)];
}

export function assembleReadingPushQueue<T extends ReadingPushQueueEntry>(
  entries: readonly T[],
  options: RouletteSelectionOptions = {}
) {
  const buckets = bucketReadingPushQueueEntries(entries);
  REGULAR_PUSH_QUEUE_PRIORITIES.forEach((priority) => {
    buckets.regular[priority] = interleaveReadingSourceGroups(buckets.regular[priority]);
  });
  return [...buckets.absolute, ...assembleRouletteBuckets(buckets.regular, options)];
}
