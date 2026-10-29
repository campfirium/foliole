import type { CycleState } from './cycleFlowTypes.js';

export interface DailyFlowSession {
  candidateMembershipHash?: string;
  rebuildSourceRevision?: number;
  dayWindow?: { start: string; end: string };
  flowFormat?: 'legacy-queue-v1' | 'cycle-v1';
  cycle?: CycleState;
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
