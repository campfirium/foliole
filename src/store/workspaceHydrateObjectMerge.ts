import type { Node, NodeReadingProfile, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

function timestampValue(value: string | null | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function isNewerTimestamp(left: string | null | undefined, right: string | null | undefined) {
  return timestampValue(left) > timestampValue(right);
}

function chooseReviewProfile(
  current: NodeReviewProfile | null | undefined,
  next: NodeReviewProfile | null | undefined
) {
  if (!current || !next) {
    return next ?? current ?? null;
  }
  return isNewerTimestamp(current.lastReviewAt, next.lastReviewAt) ? current : next;
}

function chooseReadingProfile(
  current: NodeReadingProfile | null | undefined,
  next: NodeReadingProfile | null | undefined
) {
  if (!current || !next) {
    return next ?? current ?? null;
  }
  return isNewerTimestamp(current.lastHandledAt, next.lastHandledAt) ? current : next;
}

export function mergeHydratedNode(current: Node | undefined, next: Node) {
  if (!current) {
    return next;
  }
  const baseNode = isNewerTimestamp(current.updatedAt, next.updatedAt) ? current : next;
  return {
    ...baseNode,
    reading: chooseReadingProfile(current.reading, next.reading),
    review: chooseReviewProfile(current.review, next.review)
  };
}

export function mergeHydratedNodesById(current: Record<string, Node>, next: Record<string, Node>) {
  const nodesById: Record<string, Node> = {};
  for (const [nodeId, nextNode] of Object.entries(next)) {
    nodesById[nodeId] = mergeHydratedNode(current[nodeId], nextNode);
  }
  return nodesById;
}
