import { default_w, forgetting_curve } from 'ts-fsrs';

import type { WorkspaceNodePaths } from '../../nodes/workspaceNodePaths.js';
import { assembleFsrsPushQueue } from '../unifiedPushQueueAssembler.js';
import type { PushQueuePriority, UnifiedPushQueueRules } from '../unifiedPushQueueRules.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';
import { createSeededRandom } from './reviewQueuePlannerHelpers.js';
import type { ReviewQueueTimeInput } from './reviewQueueTimeInput.js';

function resolveFsrsRetrievability(node: ReviewQueueNode, now: string, time: ReviewQueueTimeInput) {
  if (!node.review) return 0;
  const card = node.review;
  if (!card.lastReviewAt || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((time.timestamp(now) - time.timestamp(card.lastReviewAt)) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(default_w, elapsedDays, card.stability);
  return Number.isFinite(retrievability) ? retrievability : 0;
}

export function resolveFsrsQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  disperseMaterial: boolean;
  nodeOrder: string[];
  now: string;
  time: ReviewQueueTimeInput;
  pushQueueRules: UnifiedPushQueueRules;
  priorities: ReadonlyMap<string, PushQueuePriority>;
  paths: WorkspaceNodePaths;
}) {
  const random = createSeededRandom(`fsrs|${args.nodeOrder.join('|')}`);
  return assembleFsrsPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      pathNodeIds: args.paths.get(node.id)!,
      priority: args.priorities.get(node.id)!,
      retrievability: resolveFsrsRetrievability(node, args.now, args.time)
    })),
    {
      ...(args.disperseMaterial ? { materialDispersion: {} } : {}),
      priorityRatio: args.pushQueueRules.priorityRatio,
      random
    }
  ).map((entry) => entry.id);
}
