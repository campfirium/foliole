import type { NodeReadingProfile, NodeReviewProfile } from './nodeTypes';

export type WorkspaceListReading = Pick<NodeReadingProfile, 'state' | 'repetitionCount'>;
export type WorkspaceListReview = Pick<NodeReviewProfile, 'lastReviewAt'>;

export function projectWorkspaceListReading(reading: NodeReadingProfile | null | undefined): WorkspaceListReading | null {
  return reading ? { state: reading.state, repetitionCount: reading.repetitionCount } : null;
}

export function projectWorkspaceListReview(review: NodeReviewProfile | null): WorkspaceListReview | null {
  return review ? { lastReviewAt: review.lastReviewAt } : null;
}

export function isWorkspaceListReadingEqual(
  previous: WorkspaceListReading | null | undefined, current: NodeReadingProfile | null | undefined
) {
  return previous && current
    ? previous.state === current.state && previous.repetitionCount === current.repetitionCount
    : (previous ?? null) === (current ?? null);
}

export function isWorkspaceListReviewEqual(previous: WorkspaceListReview | null, current: NodeReviewProfile | null) {
  return previous && current ? previous.lastReviewAt === current.lastReviewAt : previous === current;
}
