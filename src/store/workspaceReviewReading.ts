import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  PUSH_QUEUE_PRIORITIES,
  type PushQueuePriority
} from '../features/review/model/unifiedPushQueueRules';
import type { ReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { parseLiteralUnion } from '../shared/lib/parseLiteralUnion';

import type { WorkspaceState } from './workspaceStore';

interface PriorityChainNode {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
}

export function createEmptyReviewSession(): WorkspaceState['reviewSession'] {
  return { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 };
}

export function resolveNodePriorityChain(
  currentNodeId: string,
  nodesById: Record<string, PriorityChainNode | undefined>
) {
  const priorityChain: unknown[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNode: PriorityChainNode | undefined = nodesById[currentNodeId];

  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    visitedNodeIds.add(currentNode.id);
    priorityChain.push(currentNode.priority);
    currentNode = currentNode.parentNodeId ? nodesById[currentNode.parentNodeId] : undefined;
  }
  return priorityChain;
}

export function resolveReadingPriorityChain(args: {
  currentNodeId: string;
  currentReading: NodeReadingProfile | null | undefined;
  defaultPriority: PushQueuePriority;
  nodesById: Record<string, PriorityChainNode | undefined>;
}) {
  const priorityChain = resolveNodePriorityChain(args.currentNodeId, args.nodesById);
  if (priorityChain.some((priority) => priority !== null && priority !== undefined)) {
    return priorityChain;
  }
  return [args.currentReading?.priority ?? args.defaultPriority];
}

export function buildNextReadingProfile(
  nextReading: ReadingScheduleCoreFields,
  currentReading: NodeReadingProfile | null | undefined
): NodeReadingProfile {
  const priority =
    parseLiteralUnion(nextReading.priority, PUSH_QUEUE_PRIORITIES) ??
    parseLiteralUnion(currentReading?.priority, PUSH_QUEUE_PRIORITIES) ??
    DEFAULT_UNIFIED_PUSH_QUEUE_RULES.defaultPriority;
  return {
    intervalDurationMs: nextReading.intervalDurationMs,
    intervalGrowthFactor: nextReading.intervalGrowthFactor,
    lastHandledAt: nextReading.lastHandledAt,
    nextAt: nextReading.nextAt,
    priority,
    readingPosition: currentReading?.readingPosition ?? 0,
    repetitionCount: nextReading.repetitionCount,
    state: currentReading?.state ?? 'active'
  };
}
