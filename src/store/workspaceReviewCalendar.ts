import { reviewCalendarDayKey } from '../../lib/core/review/reviewCalendarDates';
import { resolveStoredReviewDueAt } from '../../lib/core/review/reviewDayBoundary';
import type { NativeReviewCalendarDay } from '../../lib/platform/nativeReviewCalendarContract';

import { buildReviewQueuePlan, type ReviewQueueNode } from './reviewQueuePlanner';
import { resolveReviewQueueReadingAvailableAt } from './reviewQueuePlannerReadingPaths';
import { parseReviewQueueTimestamp } from './reviewQueuePlannerTime';

export function selectReviewCalendarSchedule(args: {
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  trashedNodeIds: string[];
  now: string;
  newDayStartsAtHour: number;
}) {
  const today = reviewCalendarDayKey(new Date(args.now), args.newDayStartsAtHour);
  const plan = buildReviewQueuePlan({ ...args, includeScheduled: true });
  const days: Record<string, NativeReviewCalendarDay> = {};
  for (const [kind, ids] of [
    ['items', plan.fsrsQueueNodeIds], ['topics', plan.readingQueueNodeIds]
  ] as const) {
    for (const id of new Set(ids)) {
      const node = args.nodesById[id];
      if (!node) continue;
      const availableAt = kind === 'items' ? resolveStoredReviewDueAt({
        due: node.review?.due ?? node.createdAt,
        scheduledDays: node.review?.scheduledDays ?? 0,
        newDayStartsAtHour: args.newDayStartsAtHour
      }) : resolveReviewQueueReadingAvailableAt(node, args.newDayStartsAtHour);
      const dueDay = reviewCalendarDayKey(new Date(parseReviewQueueTimestamp(availableAt)), args.newDayStartsAtHour);
      const day = dueDay < today ? today : dueDay;
      const bucket = days[day] ?? { day, items: 0, topics: 0 };
      bucket[kind] = (bucket[kind] ?? 0) + 1;
      days[day] = bucket;
    }
  }
  return days;
}
