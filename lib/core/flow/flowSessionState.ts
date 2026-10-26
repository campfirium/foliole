import type { DailyFlowSession } from './dailyFlowSession.js';
import { applyReviewSessionProgress } from './flowSessionProgress.js';

export function createEmptyReviewSession(): DailyFlowSession {
  return { currentNodeId: null, isAnswerRevealed: false, queueNodeIds: [], totalNodeCount: 0 };
}

export function isReviewSessionCompleted(reviewSession: DailyFlowSession) {
  return !reviewSession.currentNodeId && reviewSession.totalNodeCount > 0 && reviewSession.queueNodeIds.length === 0;
}

export function createStartedReviewSession(args: {
  continueNodeId: string | null;
  currentNodeId: string | null;
  queueNodeIds: string[];
  sessionStartedAt: string;
  totalNodeCount: number;
}): DailyFlowSession {
  return {
    completedAt: null,
    continueNodeId: args.continueNodeId,
    currentItemStartedAt: args.sessionStartedAt,
    currentNodeId: args.currentNodeId,
    isAnswerRevealed: false,
    queueNodeIds: args.queueNodeIds,
    readingElapsedMs: 0,
    readTopicCount: 0,
    reviewElapsedMs: 0,
    reviewedItemCount: 0,
    sessionStartedAt: args.sessionStartedAt,
    totalNodeCount: args.totalNodeCount
  };
}

export function advanceReviewSession(
  reviewSession: DailyFlowSession,
  args: {
    nextNodeId: string;
    queueNodeIds: string[];
    handledAt?: string;
    nextReviewDueAt?: string | null;
    readingElapsedMsDelta?: number;
    readTopicDelta?: number;
    reviewElapsedMsDelta?: number;
    reviewedItemDelta?: number;
    soonNodeIds?: string[];
    totalNodeCount?: number;
  }
): DailyFlowSession {
  return applyReviewSessionProgress({
    ...reviewSession,
    completedAt: null,
    currentNodeId: args.nextNodeId,
    isAnswerRevealed: false,
    queueNodeIds: args.queueNodeIds,
    ...(args.soonNodeIds ?? reviewSession.soonNodeIds
      ? { soonNodeIds: args.soonNodeIds ?? reviewSession.soonNodeIds }
      : {}),
    totalNodeCount: args.totalNodeCount ?? reviewSession.totalNodeCount
  }, args);
}

export function completeReviewSession(
  reviewSession: DailyFlowSession,
  args: {
    completedAt: string;
    continueNodeId?: string | null;
    nextReviewDueAt?: string | null;
    readingElapsedMsDelta?: number;
    readTopicDelta?: number;
    reviewElapsedMsDelta?: number;
    reviewedItemDelta?: number;
  }
): DailyFlowSession {
  return applyReviewSessionProgress({
    ...reviewSession,
    completedAt: args.completedAt,
    continueNodeId: args.continueNodeId ?? reviewSession.continueNodeId ?? null,
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    soonNodeIds: []
  }, { ...args, handledAt: args.completedAt });
}
