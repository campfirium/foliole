import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import type { PushQueuePriority } from '../features/review/model/unifiedPushQueueRules';
import type { ReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';

import type { WorkspaceState } from './workspaceStore';

export function createEmptyReviewSession(): WorkspaceState['reviewSession'] {
  return { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 };
}

export function resolveNodePriorityChain(
  currentNodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  const priorityChain: unknown[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNode: WorkspaceState['nodesById'][string] | undefined = nodesById[currentNodeId];

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
  nodesById: WorkspaceState['nodesById'];
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
  return {
    intervalDurationMs: nextReading.intervalDurationMs,
    intervalGrowthFactor: nextReading.intervalGrowthFactor,
    lastHandledAt: nextReading.lastHandledAt,
    nextAt: nextReading.nextAt,
    priority: nextReading.priority as PushQueuePriority,
    readingPosition: currentReading?.readingPosition ?? 0,
    repetitionCount: nextReading.repetitionCount,
    state: currentReading?.state ?? 'active'
  };
}
