import { forgetting_curve } from 'ts-fsrs';

import type { Node } from '../features/nodes/model/nodeTypes';
import { hasNodeContent } from '../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode, isReadingReviewItemNode, type ReviewItemNodeLike } from '../features/review/model/reviewItemKind';
import { toSchedulerCard } from '../features/review/model/reviewTypes';
import { assembleFsrsPushQueue, assembleReadingPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import {
  buildQueueMixCycle,
  normalizePushQueuePriority,
  resolveInheritedPushQueuePriority,
  type UnifiedPushQueueRules
} from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

export interface ReviewQueuePlan {
  fsrsCandidateCount: number;
  fsrsQueueNodeIds: string[];
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  readingQueueNodeIds: string[];
}

export type ReviewQueueNode = ReviewItemNodeLike & Pick<Node, 'content' | 'createdAt' | 'hasContent' | 'id' | 'parentNodeId' | 'priority' | 'reading'>;

function parseTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid timestamp: ${timestamp}`);
  }
  return parsed;
}

function createSeededRandom(seedInput: string) {
  let hash = 2166136261;
  for (const character of seedInput) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function isQueueableReadingNode(node: ReviewQueueNode | undefined, now: string): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return parseTimestamp(resolveReadingNextAt(node)) <= parseTimestamp(now);
}

function isSchedulableReadingNode(node: ReviewQueueNode | undefined): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return true;
}

function isDueFsrsNode(node: ReviewQueueNode | undefined, now: string): node is ReviewQueueNode {
  if (!node || !isFsrsReviewItemNode(node)) {
    return false;
  }
  return parseTimestamp(node.review?.due ?? now) <= parseTimestamp(now);
}

function isSchedulableFsrsNode(node: ReviewQueueNode | undefined): node is ReviewQueueNode {
  return Boolean(node && isFsrsReviewItemNode(node));
}

function resolveReadingNextAt(node: ReviewQueueNode) {
  return node.reading?.nextAt ?? node.createdAt;
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

function resolveFsrsRetrievability(node: ReviewQueueNode, now: string) {
  const card = toSchedulerCard(node.review, now);
  if (!card.last_review || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((parseTimestamp(now) - parseTimestamp(card.last_review)) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(elapsedDays, card.stability);
  return Number.isFinite(retrievability) ? retrievability : 0;
}

function resolveFsrsQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules: UnifiedPushQueueRules;
}) {
  const random = createSeededRandom(`fsrs|${args.nodeOrder.join('|')}`);
  return assembleFsrsPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: resolveNodePriority(node, args.nodesById, args.pushQueueRules.defaultPriority),
      retrievability: resolveFsrsRetrievability(node, args.now)
    })),
    { priorityRatio: args.pushQueueRules.priorityRatio, random }
  ).map((entry) => entry.id);
}

function resolveReadingQueueNodeIds(args: {
  candidates: ReviewQueueNode[];
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  pushQueueRules: UnifiedPushQueueRules;
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: resolveNodePriority(node, args.nodesById, args.pushQueueRules.defaultPriority),
      nextAt: resolveReadingNextAt(node)
    })),
    { priorityRatio: args.pushQueueRules.priorityRatio, random }
  ).map((entry) => entry.id);
}

function mixUnifiedPushQueues(args: {
  fsrsQueueNodeIds: string[];
  limit?: number;
  pushQueueRules: UnifiedPushQueueRules;
  readingQueueNodeIds: string[];
}) {
  const queueNodeIds: string[] = [];
  const limit = args.limit ?? Number.POSITIVE_INFINITY;
  const cycle = buildQueueMixCycle(args.pushQueueRules.queueMixRatio);
  let fsrsIndex = 0;
  let readingIndex = 0;
  let cycleIndex = 0;

  while (
    queueNodeIds.length < limit &&
    (fsrsIndex < args.fsrsQueueNodeIds.length || readingIndex < args.readingQueueNodeIds.length)
  ) {
    const nextKind = cycle[cycleIndex % cycle.length];
    cycleIndex += 1;

    const nextId =
      nextKind === 'fsrs'
        ? args.fsrsQueueNodeIds[fsrsIndex++]
        : args.readingQueueNodeIds[readingIndex++];

    if (nextId) {
      queueNodeIds.push(nextId);
    }
  }

  return queueNodeIds;
}

export function buildReviewQueuePlan(args: {
  includeScheduled?: boolean;
  limit?: number;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  pushQueueRules?: UnifiedPushQueueRules;
  trashedNodeIds: string[];
}): ReviewQueuePlan {
  const fsrsCandidates: ReviewQueueNode[] = [];
  const readingCandidates: ReviewQueueNode[] = [];
  const includeScheduled = args.includeScheduled ?? false;
  const pushQueueRules = args.pushQueueRules ?? getCurrentReviewSchedulerSettings().pushQueue;
  const trashedNodeIds = new Set(args.trashedNodeIds);

  args.nodeOrder.forEach((nodeId) => {
    if (trashedNodeIds.has(nodeId)) {
      return;
    }

    const node = args.nodesById[nodeId];
    const isReadingCandidate = includeScheduled ? isSchedulableReadingNode(node) : isQueueableReadingNode(node, args.now);
    if (node && isReadingCandidate) {
      readingCandidates.push(node);
      return;
    }

    const isFsrsCandidate = includeScheduled ? isSchedulableFsrsNode(node) : isDueFsrsNode(node, args.now);
    if (node && isFsrsCandidate) {
      fsrsCandidates.push(node);
    }
  });

  const fsrsQueueNodeIds = resolveFsrsQueueNodeIds({
    candidates: fsrsCandidates,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now,
    pushQueueRules
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    pushQueueRules
  });
  const queueNodeIds = mixUnifiedPushQueues({
    fsrsQueueNodeIds,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
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
