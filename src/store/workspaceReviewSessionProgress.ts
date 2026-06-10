import type { ReviewSessionState } from './workspaceStore';

function parseTimeMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveReviewSessionProgress(reviewSession: ReviewSessionState) {
  if (reviewSession.totalNodeCount <= 0) {
    return { reviewCompletedCount: 0, reviewQueueCount: 0 };
  }
  return {
    reviewCompletedCount: (reviewSession.readTopicCount ?? 0) + (reviewSession.reviewedItemCount ?? 0),
    reviewQueueCount: reviewSession.queueNodeIds.length
  };
}

export function calculateReviewStepElapsedMs(reviewSession: ReviewSessionState, handledAt: string) {
  const startMs = parseTimeMs(reviewSession.currentItemStartedAt ?? reviewSession.sessionStartedAt);
  const handledMs = parseTimeMs(handledAt);
  if (startMs === null || handledMs === null || handledMs <= startMs) {
    return 0;
  }
  return handledMs - startMs;
}

function resolveEarliestReviewDueAt(current: string | null | undefined, candidate: string | null | undefined): string | null {
  const candidateMs = parseTimeMs(candidate);
  if (candidateMs === null) {
    return current ?? null;
  }
  const currentMs = parseTimeMs(current);
  return currentMs !== null && currentMs <= candidateMs ? current! : candidate!;
}

export function applyReviewSessionProgress(
  reviewSession: ReviewSessionState,
  args: {
    handledAt?: string;
    nextReviewDueAt?: string | null;
    readingElapsedMsDelta?: number;
    readTopicDelta?: number;
    reviewElapsedMsDelta?: number;
    reviewedItemDelta?: number;
  }
) {
  return {
    ...reviewSession,
    currentItemStartedAt: args.handledAt ?? reviewSession.currentItemStartedAt ?? reviewSession.sessionStartedAt ?? null,
    nextReviewDueAt: resolveEarliestReviewDueAt(reviewSession.nextReviewDueAt, args.nextReviewDueAt),
    readingElapsedMs: (reviewSession.readingElapsedMs ?? 0) + (args.readingElapsedMsDelta ?? 0),
    readTopicCount: (reviewSession.readTopicCount ?? 0) + (args.readTopicDelta ?? 0),
    reviewElapsedMs: (reviewSession.reviewElapsedMs ?? 0) + (args.reviewElapsedMsDelta ?? 0),
    reviewedItemCount: (reviewSession.reviewedItemCount ?? 0) + (args.reviewedItemDelta ?? 0)
  };
}
