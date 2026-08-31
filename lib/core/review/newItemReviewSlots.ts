import { resolveScheduledDayStart } from './reviewDayBoundary.js';

export interface NewItemReviewProfile {
  difficulty: number;
  due: string;
  elapsedDays: number;
  lapses: number;
  lastReviewAt: string | null;
  reps: number;
  scheduledDays: number;
  stability: number;
  state: 0;
}

type ReviewSlotItem = {
  kind: string;
  review?: { due: string } | null;
};

export const NEW_ITEM_REVIEW_SLOT_DAY_COUNT = 7;

export function allocateNewItemReviewDueDates(args: {
  batchSize: number;
  newDayStartsAtHour: number;
  nodes: Iterable<ReviewSlotItem | undefined>;
  now: string;
}) {
  const dayStarts = createFutureLocalDayStarts(new Date(args.now), args.newDayStartsAtHour);
  const loadByDay = new Map(dayStarts.map((dayStart) => [toLocalDateKey(dayStart), 0]));
  countExistingReviewLoad(loadByDay, args.nodes);

  const dueDates: string[] = [];
  for (let index = 0; index < args.batchSize; index += 1) {
    const selected = selectLowestLoadDay(dayStarts, loadByDay);
    const key = toLocalDateKey(selected);
    dueDates.push(selected.toISOString());
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + 1);
  }
  return dueDates;
}

export function createInitialNewItemReviewProfile(due: string): NewItemReviewProfile {
  return {
    difficulty: 0,
    due,
    elapsedDays: 0,
    lapses: 0,
    lastReviewAt: null,
    reps: 0,
    scheduledDays: 0,
    stability: 0,
    state: 0
  };
}

function createFutureLocalDayStarts(now: Date, newDayStartsAtHour: number) {
  return Array.from({ length: NEW_ITEM_REVIEW_SLOT_DAY_COUNT }, (_, index) =>
    resolveScheduledDayStart({
      newDayStartsAtHour,
      reviewedAt: now.toISOString(),
      scheduledDays: index + 1
    })
  );
}

function countExistingReviewLoad(
  loadByDay: Map<string, number>,
  nodes: Iterable<ReviewSlotItem | undefined>
) {
  for (const node of nodes) {
    if (!node?.review || node.kind !== 'item') continue;
    const key = toLocalDateKey(new Date(node.review.due));
    if (loadByDay.has(key)) loadByDay.set(key, (loadByDay.get(key) ?? 0) + 1);
  }
}

function selectLowestLoadDay(dayStarts: Date[], loadByDay: Map<string, number>) {
  return dayStarts.reduce((selected, candidate) => {
    const selectedLoad = loadByDay.get(toLocalDateKey(selected)) ?? 0;
    const candidateLoad = loadByDay.get(toLocalDateKey(candidate)) ?? 0;
    return candidateLoad < selectedLoad ? candidate : selected;
  });
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
