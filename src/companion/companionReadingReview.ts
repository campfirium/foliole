import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { definedProps } from '../shared/lib/definedProps';
import { buildNextReadingProfile, resolveReadingPriorityChain } from '../store/workspaceReviewReading';

type ReadingReviewNode = WorkspaceSnapshot['nodesById'][string];

function patchReadingReviewNode(args: {
  node: ReadingReviewNode;
  nodeId: string;
  patch: Partial<ReadingReviewNode>;
  snapshot: WorkspaceSnapshot;
}) {
  return {
    ...args.snapshot,
    nodesById: {
      ...args.snapshot.nodesById,
      [args.nodeId]: {
        ...args.node,
        ...args.patch
      }
    }
  } satisfies WorkspaceSnapshot;
}

function buildNextReadingSnapshot(args: {
  action: 'read' | 'later' | 'dismiss' | 'shelve';
  nodeId: string;
  now: string;
  snapshot: WorkspaceSnapshot;
}) {
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node || !isReadingReviewItemNode(node)) {
    return null;
  }

  if (args.action === 'dismiss') {
    return patchReadingReviewNode({
      node,
      nodeId: args.nodeId,
      patch: { reading: node.reading ? { ...node.reading, state: 'dismissed' } : node.reading, updatedAt: args.now },
      snapshot: args.snapshot
    });
  }

  if (args.action === 'shelve') {
    if (node.anchorLink || node.specialKind || node.shelvedAt || args.snapshot.trashedNodeIds.includes(node.id)) {
      return null;
    }
    return patchReadingReviewNode({
      node,
      nodeId: args.nodeId,
      patch: { shelvedAt: args.now, updatedAt: args.now },
      snapshot: args.snapshot
    });
  }

  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const nextReading = advanceReadingScheduleCoreFields({
    ...(args.action === 'later' ? { growthFactorExponent: 0.5 } : {}),
    lastHandledAt: args.now,
    previousRepetitionCount: node.reading?.repetitionCount ?? 0,
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.nodeId,
      currentReading: node.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.snapshot.nodesById
    }),
    initialIntervalMs: pushQueueSettings.readingInitialIntervalMs,
    range: pushQueueSettings.readingIntervalGrowthFactorRange,
    ...definedProps({ previousIntervalDurationMs: node.reading?.intervalDurationMs })
  });

  return patchReadingReviewNode({
    node,
    nodeId: args.nodeId,
    patch: { reading: buildNextReadingProfile(nextReading, node.reading), updatedAt: args.now },
    snapshot: args.snapshot
  });
}

export function readCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'read',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}

export function postponeCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'later',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}

export function dismissCompanionReviewTopic(args: {
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

export function shelveCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'shelve',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}
