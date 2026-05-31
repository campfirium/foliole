import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import type { UnifiedPushQueueRules } from '../features/review/model/unifiedPushQueueRules';

import { buildReviewQueuePlan, type ReviewQueuePlan } from './reviewQueuePlanner';

interface CachedReviewQueuePlanArgs {
  includeScheduled?: boolean;
  limit?: number;
  mode?: ReviewSessionMode;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  now: string;
  pushQueueRules?: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}

const CACHE_LIMIT = 6;

type CachedReviewQueuePlanEntry = {
  args: CachedReviewQueuePlanArgs;
  plan: ReviewQueuePlan;
};

const cachedPlans: CachedReviewQueuePlanEntry[] = [];

function hasSameArgs(current: CachedReviewQueuePlanArgs, previous: CachedReviewQueuePlanArgs | null) {
  return Boolean(
    previous &&
      (previous.includeScheduled ?? false) === (current.includeScheduled ?? false) &&
      previous.limit === current.limit &&
      (previous.mode ?? 'recommended') === (current.mode ?? 'recommended') &&
      previous.nodeOrder === current.nodeOrder &&
      previous.nodesById === current.nodesById &&
      previous.now === current.now &&
      previous.pushQueueRules === current.pushQueueRules &&
      previous.trashedNodeIds === current.trashedNodeIds
  );
}

export function buildCachedReviewQueuePlan(args: CachedReviewQueuePlanArgs) {
  const cachedIndex = cachedPlans.findIndex((entry) => hasSameArgs(args, entry.args));
  if (cachedIndex >= 0) {
    const [entry] = cachedPlans.splice(cachedIndex, 1);
    if (!entry) {
      return buildReviewQueuePlan(args);
    }
    cachedPlans.unshift(entry);
    return entry.plan;
  }

  const nextPlan = buildReviewQueuePlan(args);
  cachedPlans.unshift({ args, plan: nextPlan });
  cachedPlans.splice(CACHE_LIMIT);
  return nextPlan;
}
