import { default_w, forgetting_curve } from 'ts-fsrs';

import type { Node } from '../features/nodes/model/nodeTypes';
import { toSchedulerCard } from '../features/review/model/reviewTypes';
import { assembleFsrsPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import type { PushQueuePriority, UnifiedPushQueueRules } from '../features/review/model/unifiedPushQueueRules';

import { createSeededRandom } from './reviewQueuePlannerHelpers';
import { resolveReviewQueueNodePathNodeIds } from './reviewQueuePlannerReadingPaths';
import { parseReviewQueueTimestamp } from './reviewQueuePlannerTime';

export type FsrsReviewQueueNode = Pick<Node, 'id' | 'parentNodeId' | 'priority'> & {
  review: NonNullable<Node['review']>;
};

function resolveFsrsRetrievability(node: FsrsReviewQueueNode, now: string) {
  const card = toSchedulerCard(node.review, now);
  if (!card.last_review || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((parseReviewQueueTimestamp(now) - parseReviewQueueTimestamp(card.last_review)) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(default_w, elapsedDays, card.stability);
  return Number.isFinite(retrievability) ? retrievability : 0;
}

export function resolveFsrsQueueNodeIds(args: {
  candidates: FsrsReviewQueueNode[];
  disperseMaterial: boolean;
  nodeOrder: string[];
  nodesById: Record<string, FsrsReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
  resolvePriority: (
    node: FsrsReviewQueueNode,
    nodesById: Record<string, FsrsReviewQueueNode | undefined>,
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
