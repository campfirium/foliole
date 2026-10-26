import { buildReviewQueuePlan as buildCoreReviewQueuePlan } from '../../lib/core/review/queue/reviewQueuePlanner';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

export type { ReviewQueueNode, ReviewQueuePlan } from '../../lib/core/review/queue/reviewQueuePlanner';

type CoreArgs = Parameters<typeof buildCoreReviewQueuePlan>[0];
type ReviewQueuePlanArgs = Omit<CoreArgs, 'newDayStartsAtHour' | 'readingDayStartsAtHour' | 'pushQueueRules'> &
  Partial<Pick<CoreArgs, 'newDayStartsAtHour' | 'pushQueueRules'>>;

export function buildReviewQueuePlan(args: ReviewQueuePlanArgs) {
  const settings = getCurrentReviewSchedulerSettings();
  return buildCoreReviewQueuePlan({ ...args,
    newDayStartsAtHour: args.newDayStartsAtHour ?? settings.newDayStartsAtHour,
    readingDayStartsAtHour: settings.newDayStartsAtHour,
    pushQueueRules: args.pushQueueRules ?? settings.pushQueue
  });
}
