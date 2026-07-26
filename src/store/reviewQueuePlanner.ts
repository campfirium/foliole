import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode, isReadingReviewItemNode, type ReviewItemNodeLike } from '../features/review/model/reviewItemKind';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { assembleReadingPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import {
  normalizePushQueuePriority,
  resolveInheritedPushQueuePriority,
  type UnifiedPushQueueRules
} from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { resolveFsrsQueueNodeIds } from './reviewQueuePlannerFsrs';
import { createSeededRandom, hasDeletedAncestor, hasShelvedAncestor } from './reviewQueuePlannerHelpers';
import { resolveModeQueueNodeIds } from './reviewQueuePlannerMode';
import { resolveReviewQueueNodePathNodeIds, resolveReviewQueueReadingAvailableAt, resolveReviewQueueReadingDueAt } from './reviewQueuePlannerReadingPaths';
import { isReviewProfileDue, parseReviewQueueTimestamp } from './reviewQueuePlannerTime';

export interface ReviewQueuePlan {
  fsrsCandidateCount: number;
  fsrsQueueNodeIds: string[];
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  readingQueueNodeIds: string[];
}

export type ReviewQueueNode = ReviewItemNodeLike & Pick<Node, 'content' | 'createdAt' | 'deletedAt' | 'hasContent' | 'id' | 'parentNodeId' | 'priority' | 'reading' | 'shelvedAt'>;

function isQueueableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string
): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById) || hasShelvedAncestor(node, nodesById)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return parseReviewQueueTimestamp(resolveReviewQueueReadingAvailableAt(node)) <= parseReviewQueueTimestamp(now);
}

function isSchedulableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>
): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById) || hasShelvedAncestor(node, nodesById)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return true;
}

function isDueFsrsNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string,
  newDayStartsAtHour: number
): node is ReviewQueueNode {
  if (!node || !isFsrsReviewItemNode(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById)) {
    return false;
  }
  return isReviewProfileDue(node.review, now, newDayStartsAtHour);
}

function isSchedulableFsrsNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>
): node is ReviewQueueNode {
  return Boolean(node && isFsrsReviewItemNode(node) && !hasDeletedAncestor(node, nodesById));
}

function resolveNodePriority(node: ReviewQueueNode, nodesById: Record<string, ReviewQueueNode | undefined>, defaultPriority: UnifiedPushQueueRules['defaultPriority']) {
  const priorityChain: unknown[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNode: ReviewQueueNode | undefined = node;

  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    visitedNodeIds.add(currentNode.id);
    priorityChain.push(currentNode.priority);
    currentNode = currentNode.parentNodeId ? nodesById[currentNode.parentNodeId] : undefined;
  }

  const inheritedPriority = resolveInheritedPushQueuePriority(priorityChain, defaultPriority);
  if (priorityChain.some((candidate) => candidate !== null && candidate !== undefined)) {
    return inheritedPriority;
  }

  return normalizePushQueuePriority(node.reading?.priority, defaultPriority);
}

function resolveReadingQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  disperseMaterial: boolean;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => {
      const nextAt = resolveReviewQueueReadingDueAt(node);
      return {
        dueAt: resolveReviewQueueReadingAvailableAt(node),
        id: node.id,
        intervalDurationMs: node.reading?.intervalDurationMs,
        nextAt,
        pathNodeIds: resolveReviewQueueNodePathNodeIds(node, args.nodesById),
        priority: resolveNodePriority(node, args.nodesById, args.pushQueueRules.defaultPriority),
      };
    }),
    {
      ...(args.disperseMaterial
        ? {
            materialDispersion: {
              now: args.now,
              readingInitialIntervalMs: args.pushQueueRules.readingInitialIntervalMs
            }
          }
        : {}),
      priorityRatio: args.pushQueueRules.priorityRatio,
      random
    }
  ).map((entry) => entry.id);
}

function collectReviewQueueCandidates(args: {
  includeScheduled: boolean;
  newDayStartsAtHour: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  trashedNodeIds: Set<string>;
}) {
  const fsrsCandidates: ReviewQueueNode[] = [];
  const readingCandidates: ReviewQueueNode[] = [];
  args.nodeOrder.forEach((nodeId) => {
    if (args.trashedNodeIds.has(nodeId)) return;
    const node = args.nodesById[nodeId];
    const isReadingCandidate = args.includeScheduled
      ? isSchedulableReadingNode(node, args.nodesById)
      : isQueueableReadingNode(node, args.nodesById, args.now);
    if (node && isReadingCandidate) {
      readingCandidates.push(node);
      return;
    }
    const isFsrsCandidate = args.includeScheduled
      ? isSchedulableFsrsNode(node, args.nodesById)
      : isDueFsrsNode(node, args.nodesById, args.now, args.newDayStartsAtHour);
    if (node && isFsrsCandidate) fsrsCandidates.push(node);
  });
  return { fsrsCandidates, readingCandidates };
}

export function buildReviewQueuePlan(args: {
  includeScheduled?: boolean;
  limit?: number;
  mode?: ReviewSessionMode;
  newDayStartsAtHour?: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules?: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}): ReviewQueuePlan {
  const includeScheduled = args.includeScheduled ?? false;
  const newDayStartsAtHour = args.newDayStartsAtHour
    ?? getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  const mode = args.mode ?? 'recommended';
  const pushQueueRules = args.pushQueueRules ?? getCurrentReviewSchedulerSettings().pushQueue;
  const trashedNodeIds = new Set(args.trashedNodeIds);
  const { fsrsCandidates, readingCandidates } = collectReviewQueueCandidates({
    includeScheduled,
    newDayStartsAtHour,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    trashedNodeIds
  });

  const fsrsQueueNodeIds = resolveFsrsQueueNodeIds({
    candidates: fsrsCandidates,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules,
    resolvePriority: resolveNodePriority
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules
  });
  const queueNodeIds = resolveModeQueueNodeIds({
    fsrsQueueNodeIds,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    mode,
    pushQueueRules,
    readingQueueNodeIds
  });

  return {
    fsrsCandidateCount: fsrsQueueNodeIds.length,
    fsrsQueueNodeIds,
    overflowCount: fsrsQueueNodeIds.length + readingQueueNodeIds.length - queueNodeIds.length,
    queueNodeIds,
    readingCandidateCount: readingQueueNodeIds.length,
    readingQueueNodeIds
  };
}
