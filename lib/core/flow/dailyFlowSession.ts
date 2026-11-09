import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

import type { CycleState } from './cycleFlowTypes.js';

export interface DiveFlowScope {
  id: string;
  topicIds: string[];
}

export type DiveFlowCursor = DiveFlowScope & {
  memberIds?: string[];
  mode: ReviewSessionMode;
  phase: 'initial' | 'today' | 'topics';
  position: number;
  limit: number;
  hasWork: boolean;
  waitingIds?: string[];
  resumeAfter?: number;
  revisitIds?: string[];
  stop: 'empty' | 'finished' | 'waiting' | null;
};

export interface DailyFlowSession {
  dive?: DiveFlowCursor;
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
