import type { Node } from '../../features/nodes/model/nodeTypes';
import { isFsrsReviewItemNode } from '../../features/review/model/reviewItemKind';
import type { ReviewSchedulerSettings } from '../../features/settings/model/reviewSchedulerSettings';

export interface ReviewQueueVisibility {
  currentQueueLabel: 'FSRS queue' | 'Reading queue';
  fsrsQueueCount: number;
  readingQueueCount: number;
  queueMixRatioFsrs: number;
  queueMixRatioReading: number;
}

export function buildReviewQueueVisibility(args: {
  currentNodeId: string | null;
  nodesById: Record<string, Node>;
  queueNodeIds: string[];
  reviewSchedulerSettings: ReviewSchedulerSettings;
}): ReviewQueueVisibility | null {
  const currentNode = args.currentNodeId ? args.nodesById[args.currentNodeId] : null;
  if (!currentNode) {
    return null;
  }

  let fsrsQueueCount = 0;
  let readingQueueCount = 0;
  args.queueNodeIds.forEach((nodeId) => {
    const node = args.nodesById[nodeId];
    if (!node) {
      return;
    }
    if (isFsrsReviewItemNode(node)) {
      fsrsQueueCount += 1;
      return;
    }
    readingQueueCount += 1;
  });

  return {
    currentQueueLabel: isFsrsReviewItemNode(currentNode) ? 'FSRS queue' : 'Reading queue',
    fsrsQueueCount,
    readingQueueCount,
    queueMixRatioFsrs: args.reviewSchedulerSettings.pushQueue.queueMixRatio.fsrs,
    queueMixRatioReading: args.reviewSchedulerSettings.pushQueue.queueMixRatio.reading
  };
}
