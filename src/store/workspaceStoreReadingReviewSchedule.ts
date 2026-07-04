import type { Node } from '../features/nodes/model/nodeTypes';
import { advanceReadingScheduleCoreFields } from '../features/review/model/unifiedPushQueueRules';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { resolveReadingPriorityChain } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';

export function buildNextReadingReviewState(args: {
  currentNodeId: string;
  currentNode: Node;
  growthFactorExponent?: number;
  now: string;
  snapshot: WorkspaceState;
}) {
  const pushQueueSettings = getCurrentReviewSchedulerSettings().pushQueue;
  const initialIntervalMs = pushQueueSettings.readingInitialIntervalMs;
  return advanceReadingScheduleCoreFields({
    ...(args.growthFactorExponent !== undefined ? { growthFactorExponent: args.growthFactorExponent } : {}),
    lastHandledAt: args.now,
    minimumIntervalMs: initialIntervalMs,
    ...(args.currentNode.reading?.intervalDurationMs !== undefined ? { previousIntervalDurationMs: args.currentNode.reading.intervalDurationMs } : {}),
    previousRepetitionCount: args.currentNode.reading?.repetitionCount ?? 0,
    priorityChain: resolveReadingPriorityChain({
      currentNodeId: args.currentNodeId,
      currentReading: args.currentNode.reading,
      defaultPriority: pushQueueSettings.defaultPriority,
      nodesById: args.snapshot.nodesById
    }),
    ...(initialIntervalMs !== undefined ? { initialIntervalMs } : {}),
    ...(pushQueueSettings.readingIntervalGrowthFactorRange ? { range: pushQueueSettings.readingIntervalGrowthFactorRange } : {})
  });
}
