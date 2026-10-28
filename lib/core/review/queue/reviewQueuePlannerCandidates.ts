import { hasNodeContent } from '../../nodes/nodeContentFlags.js';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../reviewItemKind.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';
import { hasDeletedAncestor, hasShelvedAncestor } from './reviewQueuePlannerHelpers.js';
import { resolveReviewQueueReadingAvailableAt } from './reviewQueuePlannerReadingPaths.js';
import { isReviewProfileDue, parseReviewQueueTimestamp } from './reviewQueuePlannerTime.js';

function isQueueableReadingNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>,
  now: string,
  readingDayStartsAtHour: number
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
  return parseReviewQueueTimestamp(resolveReviewQueueReadingAvailableAt(node, readingDayStartsAtHour)) <= parseReviewQueueTimestamp(now);
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
  newDayStartsAtHour: number
): node is ReviewQueueNode {
  if (!node || !isFsrsReviewItemNode(node)) {
    return false;
  }
  if (hasDeletedAncestor(node, nodesById)) {
    return false;
  }
  return isReviewProfileDue(node.review, now, newDayStartsAtHour);
}

function isSchedulableFsrsNode(
  node: ReviewQueueNode | undefined,
  nodesById: Record<string, ReviewQueueNode | undefined>
): node is ReviewQueueNode {
  return Boolean(node && isFsrsReviewItemNode(node) && !hasDeletedAncestor(node, nodesById));
}

export function collectReviewQueueCandidates(args: {
  includeScheduled: boolean;
  readingDayStartsAtHour: number;
  newDayStartsAtHour: number;
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
      : isQueueableReadingNode(node, args.nodesById, args.now, args.readingDayStartsAtHour);
    if (node && isReadingCandidate) {
      readingCandidates.push(node);
      return;
    }
    const isFsrsCandidate = args.includeScheduled
      ? isSchedulableFsrsNode(node, args.nodesById)
      : isDueFsrsNode(node, args.nodesById, args.now, args.newDayStartsAtHour);
    if (node && isFsrsCandidate) fsrsCandidates.push(node);
  });
  return { fsrsCandidates, readingCandidates };
}
