import type { WorkspaceNodeSnapshot } from '../../database/workspaceSnapshotHelpers.js';
import { hasNodeContent } from '../../nodes/nodeContentFlags.js';
import { isFsrsReviewItemNode, isReadingReviewItemNode, type ReviewItemNodeLike } from '../reviewItemKind.js';
import { assembleReadingPushQueue } from '../unifiedPushQueueAssembler.js';
import { normalizePushQueuePriority, resolveInheritedPushQueuePriority, type UnifiedPushQueueRules } from '../unifiedPushQueueRules.js';

import { resolveFsrsQueueNodeIds } from './reviewQueuePlannerFsrs.js';
import { createSeededRandom, hasDeletedAncestor, hasShelvedAncestor } from './reviewQueuePlannerHelpers.js';
import { resolveModeQueueNodeIds } from './reviewQueuePlannerMode.js';
import { resolveReviewQueueNodePathNodeIds, resolveReviewQueueReadingAvailableAt, resolveReviewQueueReadingDueAt } from './reviewQueuePlannerReadingPaths.js';
import { isReviewProfileDue, parseReviewQueueTimestamp } from './reviewQueuePlannerTime.js';
import type { ReviewSessionMode } from './reviewQueueTypes.js';

export interface ReviewQueuePlan {
  fsrsCandidateCount: number;
  fsrsQueueNodeIds: string[];
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  readingQueueNodeIds: string[];
}

export type ReviewQueueNode = ReviewItemNodeLike & Pick<WorkspaceNodeSnapshot, 'createdAt' | 'deletedAt' | 'hasContent' | 'id' | 'parentNodeId' | 'priority' | 'shelvedAt'> & Partial<Pick<WorkspaceNodeSnapshot, 'content' | 'reading'>>;

function isQueueableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string,
  readingDayStartsAtHour: number
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
  return parseReviewQueueTimestamp(resolveReviewQueueReadingAvailableAt(node, readingDayStartsAtHour)) <= parseReviewQueueTimestamp(now);
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
  readingDayStartsAtHour: number;
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
        dueAt: resolveReviewQueueReadingAvailableAt(node, args.readingDayStartsAtHour),
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
  readingDayStartsAtHour: number;
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
      : isQueueableReadingNode(node, args.nodesById, args.now, args.readingDayStartsAtHour);
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

export interface ReviewQueuePlanInput {
  candidateNow?: string;
  includeScheduled?: boolean;
  limit?: number;
  mode?: ReviewSessionMode;
  newDayStartsAtHour: number;
  readingDayStartsAtHour: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}

function buildOrderedQueues(args: ReviewQueuePlanInput) {
  const includeScheduled = args.includeScheduled ?? false;
  const newDayStartsAtHour = args.newDayStartsAtHour;
  const pushQueueRules = args.pushQueueRules;
  const trashedNodeIds = new Set(args.trashedNodeIds);
  const { fsrsCandidates, readingCandidates } = collectReviewQueueCandidates({
    includeScheduled,
    readingDayStartsAtHour: args.readingDayStartsAtHour,
    newDayStartsAtHour,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.candidateNow ?? args.now,
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
    readingDayStartsAtHour: args.readingDayStartsAtHour,
    disperseMaterial: !includeScheduled,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules
  });
  return { fsrsQueueNodeIds, readingQueueNodeIds };
}

export function buildReviewQueuePlan(args: ReviewQueuePlanInput): ReviewQueuePlan {
  const { fsrsQueueNodeIds, readingQueueNodeIds } = buildOrderedQueues(args);
  const queueNodeIds = resolveModeQueueNodeIds({
    fsrsQueueNodeIds,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    mode: args.mode ?? 'recommended',
    pushQueueRules: args.pushQueueRules,
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
