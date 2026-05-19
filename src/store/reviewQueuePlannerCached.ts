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

let lastArgs: CachedReviewQueuePlanArgs | null = null;
let lastPlan: ReviewQueuePlan | null = null;

function hasSameArgs(current: CachedReviewQueuePlanArgs, previous: CachedReviewQueuePlanArgs | null) {
  return Boolean(
    previous &&
      previous.includeScheduled === current.includeScheduled &&
      previous.limit === current.limit &&
      previous.mode === current.mode &&
      previous.nodeOrder === current.nodeOrder &&
      previous.nodesById === current.nodesById &&
      previous.now === current.now &&
      previous.pushQueueRules === current.pushQueueRules &&
      previous.trashedNodeIds === current.trashedNodeIds
  );
}

export function buildCachedReviewQueuePlan(args: CachedReviewQueuePlanArgs) {
  if (lastPlan && hasSameArgs(args, lastArgs)) {
    return lastPlan;
  }

  const nextPlan = buildReviewQueuePlan(args);
  lastArgs = args;
  lastPlan = nextPlan;
  return nextPlan;
}
