import type { Node } from '../features/nodes/model/nodeTypes';

export const DAILY_REVIEW_QUEUE_LIMIT = 20;

const REVIEWS_PER_NEW_CARD = 3;
const MIXED_QUEUE_NEW_CARD_RATIO = 0.25;

interface ReviewQueueCandidate {
  due: string;
  id: string;
  isNew: boolean;
  order: number;
}

export interface ReviewQueuePlan {
  newCardCount: number;
  overflowCount: number;
  queueNodeIds: string[];
  readingCandidateCount: number;
  reviewCardCount: number;
}

function isReadingCandidate(node: Node | undefined) {
  return Boolean(node && node.reveal === null);
}

function isReviewCandidate(node: Node | undefined, now: string) {
  if (!node || node.reveal === null) {
    return false;
  }
  const due = node.review?.due ?? now;
  return due <= now;
}

function isNewReviewCard(node: Node) {
  if (!node.review) {
    return true;
  }
  return node.review.state === 0 && node.review.reps === 0 && node.review.lastReviewAt === null;
}

function compareCandidates(left: ReviewQueueCandidate, right: ReviewQueueCandidate) {
  if (left.due !== right.due) {
    return left.due.localeCompare(right.due);
  }
  return left.order - right.order;
}

function toReviewQueueCandidate(node: Node, order: number, now: string): ReviewQueueCandidate {
  return {
    due: node.review?.due ?? now,
    id: node.id,
    isNew: isNewReviewCard(node),
    order
  };
}

function takeMixedQueue(reviewIds: string[], newIds: string[], limit: number) {
  const queueNodeIds: string[] = [];
  const maxNewCards = reviewIds.length === 0 ? limit : Math.max(1, Math.floor(limit * MIXED_QUEUE_NEW_CARD_RATIO));
  let insertedNewCards = 0;
  let reviewStreak = 0;
  let reviewIndex = 0;
  let newIndex = 0;

  while (queueNodeIds.length < limit) {
    const hasReview = reviewIndex < reviewIds.length;
    const hasNew = newIndex < newIds.length;
    if (!hasReview && !hasNew) {
      break;
    }

    const canInsertNew = hasNew && insertedNewCards < maxNewCards;
    const shouldInsertNew = canInsertNew && (!hasReview || reviewStreak >= REVIEWS_PER_NEW_CARD);
    if (shouldInsertNew) {
      queueNodeIds.push(newIds[newIndex] as string);
      newIndex += 1;
      insertedNewCards += 1;
      reviewStreak = 0;
      continue;
    }

    if (hasReview) {
      queueNodeIds.push(reviewIds[reviewIndex] as string);
      reviewIndex += 1;
      reviewStreak += 1;
      continue;
    }

    if (canInsertNew) {
      queueNodeIds.push(newIds[newIndex] as string);
      newIndex += 1;
      insertedNewCards += 1;
      reviewStreak = 0;
      continue;
    }

    break;
  }

  return queueNodeIds;
}

export function buildReviewQueuePlan(args: {
  limit?: number;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  now: string;
  trashedNodeIds: string[];
}): ReviewQueuePlan {
  const reviewCandidates: ReviewQueueCandidate[] = [];
  const newCandidates: ReviewQueueCandidate[] = [];
  let readingCandidateCount = 0;

  args.nodeOrder.forEach((nodeId, order) => {
    if (args.trashedNodeIds.includes(nodeId)) {
      return;
    }
    const node = args.nodesById[nodeId];
    if (isReadingCandidate(node)) {
      readingCandidateCount += 1;
      return;
    }
    if (!node || !isReviewCandidate(node, args.now)) {
      return;
    }

    const candidate = toReviewQueueCandidate(node, order, args.now);
    if (candidate.isNew) {
      newCandidates.push(candidate);
      return;
    }
    reviewCandidates.push(candidate);
  });

  reviewCandidates.sort(compareCandidates);
  newCandidates.sort(compareCandidates);

  const queueNodeIds = takeMixedQueue(
    reviewCandidates.map((candidate) => candidate.id),
    newCandidates.map((candidate) => candidate.id),
    args.limit ?? DAILY_REVIEW_QUEUE_LIMIT
  );

  return {
    newCardCount: queueNodeIds.filter((nodeId) => newCandidates.some((candidate) => candidate.id === nodeId)).length,
    overflowCount: reviewCandidates.length + newCandidates.length - queueNodeIds.length,
    queueNodeIds,
    readingCandidateCount,
    reviewCardCount: queueNodeIds.filter((nodeId) => reviewCandidates.some((candidate) => candidate.id === nodeId)).length
  };
}
