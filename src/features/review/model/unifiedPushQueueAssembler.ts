import {
  disperseOrderedMaterial,
  disperseReadingMaterial,
  type OrderedMaterialDispersionOptions,
  type ReadingMaterialDispersionOptions
} from './readingMaterialDispersion';
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
  pathNodeIds?: readonly string[];
  priority: PushQueuePriority;
  retrievability: number;
}

export interface ReadingPushQueueEntry {
  dueAt?: string;
  id: string;
  intervalDurationMs?: number | null | undefined;
  priority: PushQueuePriority;
  nextAt: string;
  pathNodeIds?: readonly string[];
}

export interface RouletteSelectionOptions {
  priorityRatio?: number;
  random?: () => number;
}

export interface FsrsPushQueueOptions extends RouletteSelectionOptions {
  materialDispersion?: OrderedMaterialDispersionOptions;
}

export interface ReadingPushQueueOptions extends RouletteSelectionOptions {
  materialDispersion?: ReadingMaterialDispersionOptions;
}

export type RegularPriorityBuckets<T> = Record<RegularPushQueuePriority, T[]>;

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

function bucketFsrsPushQueueEntries<T extends FsrsPushQueueEntry>(entries: readonly T[]) {
  return bucketPriorityQueueEntries(entries, compareFsrsForgettingDescending);
}

function bucketReadingPushQueueEntries<T extends ReadingPushQueueEntry>(entries: readonly T[]) {
  return bucketPriorityQueueEntries(entries, compareReadingNextAtAscending);
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

function assembleRouletteBuckets<T>(
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
  options: FsrsPushQueueOptions = {}
) {
  const buckets = bucketFsrsPushQueueEntries(entries);
  if (options.materialDispersion) {
    REGULAR_PUSH_QUEUE_PRIORITIES.forEach((priority) => {
      buckets.regular[priority] = disperseOrderedMaterial(buckets.regular[priority], options.materialDispersion!);
    });
  }
  return [...buckets.absolute, ...assembleRouletteBuckets(buckets.regular, options)];
}

export function assembleReadingPushQueue<T extends ReadingPushQueueEntry>(
  entries: readonly T[],
  options: ReadingPushQueueOptions = {}
) {
  const buckets = bucketReadingPushQueueEntries(entries);
  if (options.materialDispersion) {
    REGULAR_PUSH_QUEUE_PRIORITIES.forEach((priority) => {
      buckets.regular[priority] = disperseReadingMaterial(buckets.regular[priority], options.materialDispersion!);
    });
  }
  return [...buckets.absolute, ...assembleRouletteBuckets(buckets.regular, options)];
}
