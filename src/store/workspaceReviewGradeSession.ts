import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import type { WorkspaceState } from './workspaceStore';
type ReviewSession = WorkspaceState['reviewSession'];

export function buildReviewSessionAfterGrade(args: {
  continueNodeId: string | null;
  nextDueAt: string;
  nextNodeId: string | null;
  now: string;
  queueNodeIds: string[];
  reviewElapsedMsDelta: number;
  reviewSession: ReviewSession;
  reviewedItemDelta: number;
}): ReviewSession {
  if (args.nextNodeId) {
    return advanceReviewSession(args.reviewSession, {
      handledAt: args.now,
      nextReviewDueAt: args.nextDueAt,
      nextNodeId: args.nextNodeId,
      queueNodeIds: args.queueNodeIds,
      reviewElapsedMsDelta: args.reviewElapsedMsDelta,
      reviewedItemDelta: args.reviewedItemDelta
    });
  }
  return completeReviewSession(args.reviewSession, {
    completedAt: args.now,
    continueNodeId: args.continueNodeId,
    nextReviewDueAt: args.nextDueAt,
    reviewElapsedMsDelta: args.reviewElapsedMsDelta,
    reviewedItemDelta: args.reviewedItemDelta
  });
}
