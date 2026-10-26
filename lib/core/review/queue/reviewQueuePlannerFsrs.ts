import { default_w, forgetting_curve } from 'ts-fsrs';

import { assembleFsrsPushQueue } from '../unifiedPushQueueAssembler.js';
import type { PushQueuePriority, UnifiedPushQueueRules } from '../unifiedPushQueueRules.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';
import { createSeededRandom } from './reviewQueuePlannerHelpers.js';
import { resolveReviewQueueNodePathNodeIds } from './reviewQueuePlannerReadingPaths.js';
import { parseReviewQueueTimestamp } from './reviewQueuePlannerTime.js';

function resolveFsrsRetrievability(node: ReviewQueueNode, now: string) {
  if (!node.review) return 0;
  const card = node.review;
  if (!card.lastReviewAt || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((parseReviewQueueTimestamp(now) - parseReviewQueueTimestamp(card.lastReviewAt)) / (24 * 60 * 60 * 1000), 0);
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
