import type { Node } from '../features/nodes/model/nodeTypes';
import { assembleFsrsPushQueue, assembleReadingPushQueue } from '../features/review/model/unifiedPushQueueAssembler';
import {
  buildQueueMixCycle,
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES
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

function isQueueableReadingNode(node: Node | undefined) {
  return Boolean(node && node.reveal === null && node.content.trim().length > 0);
}

function isDueFsrsNode(node: Node | undefined, now: string) {
  if (!node || node.reveal === null) {
    return false;
  }
  return (node.review?.due ?? now) <= now;
}

function resolveFsrsQueueNodeIds(args: {
  candidates: Node[];
  nodeOrder: string[];
  now: string;
}) {
  const random = createSeededRandom(`fsrs|${args.nodeOrder.join('|')}`);
  return assembleFsrsPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority,
      retrievability: parseTimestamp(node.review?.due ?? args.now)
    })),
    { random }
  ).map((entry) => entry.id);
}

function resolveReadingQueueNodeIds(args: {
  candidates: Node[];
  nodeOrder: string[];
}) {
  const random = createSeededRandom(`reading|${args.nodeOrder.join('|')}`);
  return assembleReadingPushQueue(
    args.candidates.map((node) => ({
      id: node.id,
      priority: DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority,
      nextAt: node.createdAt
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
    if (isQueueableReadingNode(node)) {
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
    now: args.now
  });
  const readingQueueNodeIds = resolveReadingQueueNodeIds({
    candidates: readingCandidates,
    nodeOrder: args.nodeOrder
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
