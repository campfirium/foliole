import { default_w, forgetting_curve } from 'ts-fsrs';

import { toSchedulerCard } from '../features/review/model/reviewTypes';
import { assembleFsrsPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import type { PushQueuePriority, UnifiedPushQueueRules } from '../features/review/model/unifiedPushQueueRules';

import { createSeededRandom } from './reviewQueuePlannerHelpers';
import { resolveReviewQueueNodePathNodeIds } from './reviewQueuePlannerReadingPaths';
import type { ReviewQueueNode } from './reviewQueuePlanner';
import { parseReviewQueueTimestamp } from './reviewQueuePlannerTime';


function resolveFsrsRetrievability(node: ReviewQueueNode, now: string) {
  if (!node.review) return 0;
  const card = toSchedulerCard(node.review, now);
  if (!card.last_review || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((parseReviewQueueTimestamp(now) - parseReviewQueueTimestamp(card.last_review)) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(default_w, elapsedDays, card.stability);
  return Number.isFinite(retrievability) ? retrievability : 0;
}

export function resolveFsrsQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  disperseMaterial: boolean;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
  resolvePriority: (
    node: ReviewQueueNode,
    nodesById: Record<string, ReviewQueueNode | undefined>,
    defaultPriority: UnifiedPushQueueRules['defaultPriority']
  ) => PushQueuePriority;
}) {
  const random = createSeededRandom(`fsrs|${args.nodeOrder.join('|')}`);
  return assembleFsrsPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      pathNodeIds: resolveReviewQueueNodePathNodeIds(node, args.nodesById),
      priority: args.resolvePriority(node, args.nodesById, args.pushQueueRules.defaultPriority),
      retrievability: resolveFsrsRetrievability(node, args.now)
    })),
    {
      ...(args.disperseMaterial ? { materialDispersion: {} } : {}),
      priorityRatio: args.pushQueueRules.priorityRatio,
      random
    }
  ).map((entry) => entry.id);
}
