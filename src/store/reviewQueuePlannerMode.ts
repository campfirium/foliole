import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { buildQueueMixCycle, type UnifiedPushQueueRules } from '../features/review/model/unifiedPushQueueRules';

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

  while (queueNodeIds.length < limit && fsrsIndex < args.fsrsQueueNodeIds.length) {
    const nextKind = cycle[cycleIndex % cycle.length];
    cycleIndex += 1;
    if (nextKind === 'reading' && readingIndex >= args.readingQueueNodeIds.length) {
      continue;
    }
    const nextId = nextKind === 'fsrs' ? args.fsrsQueueNodeIds[fsrsIndex++] : args.readingQueueNodeIds[readingIndex++];
    if (nextId) queueNodeIds.push(nextId);
  }

  return queueNodeIds;
}

export function resolveModeQueueNodeIds(args: {
  fsrsQueueNodeIds: string[];
  limit?: number;
  mode: ReviewSessionMode;
  pushQueueRules: UnifiedPushQueueRules;
  readingQueueNodeIds: string[];
}) {
  const limit = args.limit ?? Number.POSITIVE_INFINITY;
  const limited = (nodeIds: string[]) => nodeIds.slice(0, limit);
  if (args.mode === 'review-first') {
    return limited([...args.fsrsQueueNodeIds, ...mixUnifiedPushQueues(args).filter((nodeId) => args.readingQueueNodeIds.includes(nodeId))]);
  }
  if (args.mode === 'reading-only') {
    return limited(args.readingQueueNodeIds);
  }
  return mixUnifiedPushQueues(args);
}
