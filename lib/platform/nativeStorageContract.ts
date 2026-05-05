import type { UnifiedPushQueueRules } from '../core/review/unifiedPushQueueRules.js';

import type { NativeSchedulerCard } from './nativeContract.js';

export interface NativeWorkspaceAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
}

export interface NativeWorkspaceReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

export interface NativeWorkspaceReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

export interface NativeWorkspaceNodeSnapshot {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  content: string;
  reveal: string | null;
  anchorLink: NativeWorkspaceAnchorLink | null;
  reading: NativeWorkspaceReadingProfile | null;
  review: NativeWorkspaceReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface NativeWorkspaceSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, NativeWorkspaceNodeSnapshot>;
  trashedNodeIds: string[];
}

export interface NativeReviewSchedulerSettings {
  algorithm: string;
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  pushQueue: UnifiedPushQueueRules;
  updatedAt: string;
}

export interface NativeNodeSnapshotArgs {
  nodeId: string;
  parentNodeId: string | null;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  content: string;
  reveal: string | null;
  anchorLink: NativeWorkspaceAnchorLink | null;
  reading?: NativeWorkspaceReadingProfile | null;
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NativeReadingProgressNodeViewState {
  nodeId: string;
  scrollTop: number;
  selectionFrom: number | null;
  selectionTo: number | null;
}

export interface NativeReadingProgressSnapshot {
  activeNodeId: string | null;
  nodeViewStateById: Record<
    string,
    { scrollTop: number; selectionFrom: number | null; selectionTo: number | null; updatedAt: string }
  >;
}

export interface NativeSaveReadingProgressArgs {
  activeNodeId: string | null;
  nodeViewStates: NativeReadingProgressNodeViewState[];
  updatedAt: string;
}

export interface NativeApplyReviewGradeArgs {
  nodeId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  cardBefore: NativeSchedulerCard;
  cardAfter: NativeSchedulerCard;
}

export interface NativeRelearnNodeArgs {
  nodeId: string;
}
