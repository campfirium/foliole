import type { NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import {
  DEFAULT_UNIFIED_PUSH_QUEUE_RULES,
  PUSH_QUEUE_PRIORITIES,
  type PushQueuePriority
} from '../features/review/model/unifiedPushQueueRules';
import type { ReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { parseLiteralUnion } from '../shared/lib/parseLiteralUnion';

import { applyReviewSessionProgress } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

interface PriorityChainNode {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
}

export function createEmptyReviewSession(): WorkspaceState['reviewSession'] {
  return { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 };
}

export function isReviewSessionCompleted(reviewSession: WorkspaceState['reviewSession']) {
  return !reviewSession.currentNodeId && reviewSession.totalNodeCount > 0 && reviewSession.queueNodeIds.length === 0;
}

export function createStartedReviewSession(args: {
  continueNodeId: string | null;
  currentNodeId: string | null;
  queueNodeIds: string[];
  sessionStartedAt: string;
  totalNodeCount: number;
}): WorkspaceState['reviewSession'] {
  return {
    completedAt: null,
    continueNodeId: args.continueNodeId,
    currentItemStartedAt: args.sessionStartedAt,
    currentNodeId: args.currentNodeId,
    isAnswerRevealed: false,
    queueNodeIds: args.queueNodeIds,
    readingElapsedMs: 0,
    readTopicCount: 0,
    reviewElapsedMs: 0,
    reviewedItemCount: 0,
    sessionStartedAt: args.sessionStartedAt,
    totalNodeCount: args.totalNodeCount
  };
}

export function advanceReviewSession(
  reviewSession: WorkspaceState['reviewSession'],
  args: {
    nextNodeId: string;
    queueNodeIds: string[];
    handledAt?: string;
    nextReviewDueAt?: string | null;
    readingElapsedMsDelta?: number;
    readTopicDelta?: number;
    reviewElapsedMsDelta?: number;
    reviewedItemDelta?: number;
    soonNodeIds?: string[];
    totalNodeCount?: number;
  }
): WorkspaceState['reviewSession'] {
  return applyReviewSessionProgress({
    ...reviewSession,
    completedAt: null,
    currentNodeId: args.nextNodeId,
    isAnswerRevealed: false,
    queueNodeIds: args.queueNodeIds,
    ...(args.soonNodeIds ?? reviewSession.soonNodeIds
      ? { soonNodeIds: args.soonNodeIds ?? reviewSession.soonNodeIds }
      : {}),
    totalNodeCount: args.totalNodeCount ?? reviewSession.totalNodeCount
  }, args);
}

export function completeReviewSession(
  reviewSession: WorkspaceState['reviewSession'],
  args: {
    completedAt: string;
    continueNodeId?: string | null;
    nextReviewDueAt?: string | null;
    readingElapsedMsDelta?: number;
    readTopicDelta?: number;
    reviewElapsedMsDelta?: number;
    reviewedItemDelta?: number;
  }
): WorkspaceState['reviewSession'] {
  return applyReviewSessionProgress({
    ...reviewSession,
    completedAt: args.completedAt,
    continueNodeId: args.continueNodeId ?? reviewSession.continueNodeId ?? null,
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    soonNodeIds: []
  }, { ...args, handledAt: args.completedAt });
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

export function buildDismissedReadingProfile(args: {
  currentNodeId: string;
  currentReading: NodeReadingProfile | null | undefined;
  defaultPriority: PushQueuePriority;
  nodesById: Record<string, PriorityChainNode | undefined>;
  now: string;
}): NodeReadingProfile {
  const priority =
    parseLiteralUnion(args.currentReading?.priority, PUSH_QUEUE_PRIORITIES) ??
    parseLiteralUnion(
      resolveReadingPriorityChain({
        currentNodeId: args.currentNodeId,
        currentReading: args.currentReading,
        defaultPriority: args.defaultPriority,
        nodesById: args.nodesById
      })[0],
      PUSH_QUEUE_PRIORITIES
    ) ??
    args.defaultPriority;

  return {
    intervalDurationMs: args.currentReading?.intervalDurationMs ?? 0,
    intervalGrowthFactor: args.currentReading?.intervalGrowthFactor ?? 1,
    lastHandledAt: args.now,
    nextAt: args.currentReading?.nextAt ?? args.now,
    priority,
    readingPosition: args.currentReading?.readingPosition ?? 0,
    repetitionCount: args.currentReading?.repetitionCount ?? 0,
    state: 'dismissed'
  };
}
