import {
  allocateNewItemReviewDueDates as allocateSharedNewItemReviewDueDates,
  createInitialNewItemReviewProfile
} from '../../lib/core/review/newItemReviewSlots.js';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

// Only an item's due date counts toward the load a new item is spread over.
type ReviewSlotNode = { kind: string; review?: { due: string } | null };

export function allocateNewItemReviewDueDates(args: {
  batchSize: number;
  newDayStartsAtHour?: number;
  newItemLoadBalancingDays?: number;
  nodes: Iterable<ReviewSlotNode | undefined>;
  now: string;
}) {
  const newDayStartsAtHour =
    args.newDayStartsAtHour ?? getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  const newItemLoadBalancingDays =
    args.newItemLoadBalancingDays ?? getCurrentReviewSchedulerSettings().newItemLoadBalancingDays;
  return allocateSharedNewItemReviewDueDates({ ...args, newDayStartsAtHour, newItemLoadBalancingDays });
}

export function createNewItemReviewProfiles(args: {
  batchSize: number;
  nodesById: Record<string, ReviewSlotNode | undefined>;
  now: string;
}) {
  return allocateNewItemReviewDueDates({
    batchSize: args.batchSize,
    nodes: Object.values(args.nodesById),
    now: args.now
  }).map((due) => createInitialNewItemReviewProfile(due));
}
