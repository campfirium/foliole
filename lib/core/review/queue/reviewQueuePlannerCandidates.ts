import { hasNodeContent } from '../../nodes/nodeContentFlags.js';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../reviewItemKind.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';
import { hasDeletedAncestor, hasShelvedAncestor } from './reviewQueuePlannerHelpers.js';
import type { ReviewQueueTimeInput } from './reviewQueueTimeInput.js';

function isQueueableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string,
  time: ReviewQueueTimeInput
): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById) || hasShelvedAncestor(node, nodesById)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return time.timestamp(time.readingAvailableAt(node)) <= time.timestamp(now);
}

function isSchedulableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>
): node is ReviewQueueNode {
  if (!node || !isReadingReviewItemNode(node) || !hasNodeContent(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById) || hasShelvedAncestor(node, nodesById)) {
    return false;
  }
  if (node.reading && node.reading.state !== 'active') {
    return false;
  }
  return true;
}

function isDueFsrsNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string,
  time: ReviewQueueTimeInput
): node is ReviewQueueNode {
  if (!node || !isFsrsReviewItemNode(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById)) {
    return false;
  }
  return time.reviewDueAt(node, now) <= time.timestamp(now);
}

function isSchedulableFsrsNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>
): node is ReviewQueueNode {
  return Boolean(node && isFsrsReviewItemNode(node) && !hasDeletedAncestor(node, nodesById));
}

export function collectReviewQueueCandidates(args: {
  includeScheduled: boolean;
  time: ReviewQueueTimeInput;
  nodeOrder: string[];
  nodesById: Record<string, ReviewQueueNode | undefined>;
  now: string;
  trashedNodeIds: Set<string>;
}) {
  const fsrsCandidates: ReviewQueueNode[] = [];
  const readingCandidates: ReviewQueueNode[] = [];
  args.nodeOrder.forEach((nodeId) => {
    if (args.trashedNodeIds.has(nodeId)) return;
    const node = args.nodesById[nodeId];
    const isReadingCandidate = args.includeScheduled
      ? isSchedulableReadingNode(node, args.nodesById)
      : isQueueableReadingNode(node, args.nodesById, args.now, args.time);
    if (node && isReadingCandidate) {
      readingCandidates.push(node);
      return;
    }
    const isFsrsCandidate = args.includeScheduled
      ? isSchedulableFsrsNode(node, args.nodesById)
      : isDueFsrsNode(node, args.nodesById, args.now, args.time);
    if (node && isFsrsCandidate) fsrsCandidates.push(node);
  });
  return { fsrsCandidates, readingCandidates };
}
