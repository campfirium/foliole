import {
  allocateNewItemReviewDueDates as allocateSharedNewItemReviewDueDates,
  createInitialNewItemReviewProfile
} from '../../lib/core/review/newItemReviewSlots.js';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

type ReviewSlotNode = Pick<Node, 'kind' | 'review'>;

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
