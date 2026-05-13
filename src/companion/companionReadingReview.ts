import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { buildNextReadingProfile, resolveReadingPriorityChain } from '../store/workspaceReviewReading';

function buildNextReadingSnapshot(args: {
  action: 'complete' | 'defer' | 'dismiss';
  nodeId: string;
  now: string;
  snapshot: WorkspaceSnapshot;
}) {
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node || !isReadingReviewItemNode(node)) {
    return null;
  }

  if (args.action === 'dismiss') {
    return {
      ...args.snapshot,
      nodesById: {
        ...args.snapshot.nodesById,
        [args.nodeId]: {
          ...node,
          reading: node.reading ? { ...node.reading, state: 'dismissed' } : node.reading,
          updatedAt: args.now
        }
      }
    } satisfies WorkspaceSnapshot;
  }

  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const nextReading = advanceReadingScheduleCoreFields({
    lastHandledAt: args.now,
    previousIntervalDurationMs: node.reading?.intervalDurationMs,
    previousRepetitionCount: node.reading?.repetitionCount ?? 0,
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.nodeId,
      currentReading: node.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.snapshot.nodesById
    }),
    initialIntervalMs: pushQueueSettings.readingInitialIntervalMs,
    range: pushQueueSettings.readingIntervalGrowthFactorRange
  });

  return {
    ...args.snapshot,
    nodesById: {
      ...args.snapshot.nodesById,
      [args.nodeId]: {
        ...node,
        reading: buildNextReadingProfile(nextReading, node.reading),
        updatedAt: args.now
      }
    }
  } satisfies WorkspaceSnapshot;
}

export function completeCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'complete',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}

export function deferCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'defer',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}

export function dismissCompanionReadingReview(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'dismiss',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}
