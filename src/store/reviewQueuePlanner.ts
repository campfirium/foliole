import { forgetting_curve } from 'ts-fsrs';

import type { Node } from '../features/nodes/model/nodeTypes';
import { toSchedulerCard } from '../features/review/model/reviewTypes';
import { assembleFsrsPushQueue, assembleReadingPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import {
  buildQueueMixCycle,
  normalizePushQueuePriority,
  resolveInheritedPushQueuePriority
} from '../features/review/model/unifiedPushQueueRules';

export interface ReviewQueuePlan {
  fsrsCandidateCount: number;
  fsrsQueueNodeIds: string[];
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  readingQueueNodeIds: string[];
}

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

function isQueueableReadingNode(node: Node | undefined, now: string) {
  if (!node || node.reveal !== null || node.content.trim().length === 0) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return parseTimestamp(resolveReadingNextAt(node)) <= parseTimestamp(now);
}

function isDueFsrsNode(node: Node | undefined, now: string) {
  if (!node || node.reveal === null) {
    return false;
  }
  return parseTimestamp(node.review?.due ?? now) <= parseTimestamp(now);
}

function resolveReadingNextAt(node: Node) {
  return node.reading?.nextAt ?? node.createdAt;
}

function resolveNodePriority(node: Node, nodesById: Record<string, Node>) {
  const priorityChain: unknown[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNode: Node | undefined = node;

  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    visitedNodeIds.add(currentNode.id);
    priorityChain.push(currentNode.priority);
    currentNode = currentNode.parentNodeId ? nodesById[currentNode.parentNodeId] : undefined;
  }

  const inheritedPriority = resolveInheritedPushQueuePriority(priorityChain);
  if (priorityChain.some((candidate) => candidate !== null && candidate !== undefined)) {
    return inheritedPriority;
  }

  return normalizePushQueuePriority(node.reading?.priority);
}

function resolveFsrsRetrievability(node: Node, now: string) {
  const card = toSchedulerCard(node.review, now);
  if (!card.last_review || card.stability <= 0) {
    return 0;
  }
  const elapsedDays = Math.max((parseTimestamp(now) - parseTimestamp(card.last_review)) / (24 * 60 * 60 * 1000), 0);
  const retrievability = forgetting_curve(elapsedDays, card.stability);
  return Number.isFinite(retrievability) ? retrievability : 0;
}

function resolveFsrsQueueNodeIds(args: {
  candidates: Node[];
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  now: string;
}) {
  const random = createSeededRandom(`fsrs|${args.nodeOrder.join('|')}`);
  return assembleFsrsPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: resolveNodePriority(node, args.nodesById),
      retrievability: resolveFsrsRetrievability(node, args.now)
    })),
    { random }
  ).map((entry) => entry.id);
}

function resolveReadingQueueNodeIds(args: {
  candidates: Node[];
  nodeOrder: string[];
  nodesById: Record<string, Node>;
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: resolveNodePriority(node, args.nodesById),
      nextAt: resolveReadingNextAt(node)
    })),
    { random }
  ).map((entry) => entry.id);
}

function mixUnifiedPushQueues(args: {
  fsrsQueueNodeIds: string[];
  limit?: number;
  readingQueueNodeIds: string[];
}) {
  const queueNodeIds: string[] = [];
  const limit = args.limit ?? Number.POSITIVE_INFINITY;
  const cycle = buildQueueMixCycle();
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
  limit?: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  now: string;
  trashedNodeIds: string[];
}): ReviewQueuePlan {
  const fsrsCandidates: Node[] = [];
  const readingCandidates: Node[] = [];
  const trashedNodeIds = new Set(args.trashedNodeIds);

  args.nodeOrder.forEach((nodeId) => {
    if (trashedNodeIds.has(nodeId)) {
      return;
    }

    const node = args.nodesById[nodeId];
    if (isQueueableReadingNode(node, args.now)) {
      readingCandidates.push(node);
      return;
    }

    if (isDueFsrsNode(node, args.now)) {
      fsrsCandidates.push(node);
    }
  });

  const fsrsQueueNodeIds = resolveFsrsQueueNodeIds({
    candidates: fsrsCandidates,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    now: args.now
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById
  });
  const queueNodeIds = mixUnifiedPushQueues({
    fsrsQueueNodeIds,
    limit: args.limit,
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
