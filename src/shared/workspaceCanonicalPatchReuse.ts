import { readWorkspaceRecordPatch } from './workspaceRecordPatch';

interface CanonicalPatchNode {
  anchorLink?: unknown;
  content?: unknown;
  createdAt?: unknown;
  deletedAt?: string | null;
  hasContent?: unknown;
  hasReveal?: unknown;
  id: string;
  kind?: unknown;
  parentNodeId?: unknown;
  priority?: unknown;
  reading?: unknown;
  reveal?: unknown;
  review?: unknown;
  shelvedAt?: unknown;
}

function hasSameMembershipNode(
  previous: CanonicalPatchNode | undefined,
  next: CanonicalPatchNode | undefined
) {
  return previous?.id === next?.id && previous?.deletedAt === next?.deletedAt;
}

function hasSameReviewQueueNode(
  previous: CanonicalPatchNode | undefined,
  next: CanonicalPatchNode | undefined
) {
  if (!previous || !next) return previous === next;
  const previousHasContent = typeof previous.hasContent === 'boolean' ? previous.hasContent : previous.content;
  const nextHasContent = typeof next.hasContent === 'boolean' ? next.hasContent : next.content;
  const previousHasReveal = typeof previous.hasReveal === 'boolean' ? previous.hasReveal : previous.reveal;
  const nextHasReveal = typeof next.hasReveal === 'boolean' ? next.hasReveal : next.reveal;
  return hasSameMembershipNode(previous, next) &&
    previous.anchorLink === next.anchorLink &&
    previous.createdAt === next.createdAt &&
    previous.kind === next.kind &&
    previousHasContent === nextHasContent &&
    previousHasReveal === nextHasReveal &&
    previous.parentNodeId === next.parentNodeId &&
    previous.priority === next.priority &&
    previous.reading === next.reading &&
    previous.review === next.review &&
    previous.shelvedAt === next.shelvedAt;
}

function canReusePatch<T extends CanonicalPatchNode>(
  next: Record<string, T | undefined>,
  previous: Record<string, T | undefined>,
  compare: (left: CanonicalPatchNode | undefined, right: CanonicalPatchNode | undefined) => boolean
) {
  const changedNodeIds = readWorkspaceRecordPatch(next, previous);
  return Boolean(changedNodeIds?.every((nodeId) => compare(previous[nodeId], next[nodeId])));
}

export function canReuseCanonicalMembershipPatch<T extends CanonicalPatchNode>(
  next: Record<string, T | undefined>,
  previous: Record<string, T | undefined>
) {
  return canReusePatch(next, previous, hasSameMembershipNode);
}

export function canReuseReviewQueuePatch<T extends CanonicalPatchNode>(
  next: Record<string, T | undefined>,
  previous: Record<string, T | undefined>
) {
  return canReusePatch(next, previous, hasSameReviewQueueNode);
}
