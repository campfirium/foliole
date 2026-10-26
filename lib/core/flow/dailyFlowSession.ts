export interface DailyFlowSession {
  daily?: { scope: string; dayKey: string; revision: number };
  completedAt?: string | null;
  continueNodeId?: string | null;
  currentItemStartedAt?: string | null;
  currentNodeId: string | null;
  isAnswerRevealed: boolean;
  queueNodeIds: string[];
  readingElapsedMs?: number;
  readTopicCount?: number;
  reviewElapsedMs?: number;
  reviewedItemCount?: number;
  nextReviewDueAt?: string | null;
  sessionStartedAt?: string | null;
  soonNodeIds?: string[];
  // Pending Soon excluded by the current mode, rather than completed work.
  hiddenSoonNodeIds?: string[];
  totalNodeCount: number;
}
