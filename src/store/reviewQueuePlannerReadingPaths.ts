import { resolveReviewQueueReadingAvailableAt as resolveAvailableAt } from '../../lib/core/review/queue/reviewQueuePlannerReadingPaths';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import type { ReviewQueueNode } from './reviewQueuePlanner';

export { resolveReviewQueueNodePathNodeIds, resolveReviewQueueReadingDueAt } from '../../lib/core/review/queue/reviewQueuePlannerReadingPaths';

export function resolveReviewQueueReadingAvailableAt(node: ReviewQueueNode,
  newDayStartsAtHour = getCurrentReviewSchedulerSettings().newDayStartsAtHour) {
  return resolveAvailableAt(node, newDayStartsAtHour);
}
