export type AuditPhase = 'prepare' | 'capture' | 'restart';
export type ReviewAction = 'grade' | 'read' | 'later' | 'dismiss';

export interface AuditContext {
  checkpoint: AuditPhase;
  commitSha: string;
  deploymentRunId: string;
  deviceIdentity: string;
  runId: string;
}

export interface OutgoingState {
  recordPresent: boolean;
  stateSeq: number | null;
  syncDirty: number | null;
  updatedAt: string | null;
}

export interface FsrsAuditState {
  due: string;
  itemKind: 'fsrs';
  lapses: number;
  lastReviewAt: string | null;
  latestReviewLog: null | {
    id: string;
    opId: string;
    reviewedAt: string;
    schedulerVersion: string;
  };
  nodeId: string;
  outgoing: OutgoingState;
  reps: number;
  reviewLogCount: number;
  reviewLogOutgoing: 'none' | 'pending' | 'synced';
  state: number;
}

export interface ReadingAuditState {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  itemKind: 'reading';
  lastHandledAt: string | null;
  nextAt: string | null;
  nodeId: string;
  outgoing: OutgoingState;
  priority: number;
  repetitionCount: number;
  state: string;
}

export interface ReviewAuditState {
  fsrs: FsrsAuditState;
  reading: ReadingAuditState[];
  schedulerVersion: string;
}

export interface ExpectedAction {
  action: ReviewAction;
  itemKind: 'fsrs' | 'reading';
  nodeId: string;
}

export interface AcceptanceSession {
  baseline: ReviewAuditState;
  captured?: ReviewAuditState;
  commitSha: string;
  deploymentRunId: string;
  deviceIdentity: string;
  expectedActions: ExpectedAction[];
  fsrsNodeId: string;
  readingNodeIds: string[];
}

export type Section<T> = { error?: string; status: 'available' | 'invalid' | 'missing'; value?: T };
