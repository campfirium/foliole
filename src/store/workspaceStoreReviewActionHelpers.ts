import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { captureWorkspaceHistoryContext } from './workspaceHistoryContext';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { createReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { SequentialReadingChange } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';
import {
  createTopicDismissHistoryEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceTopicDismissActionHistory';

type ReviewSession = WorkspaceState['reviewSession'];

export async function persistReviewGradeMutation(args: {
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
  cardBefore: SchedulerCard;
  cardAfter: SchedulerCard;
}, persistence: WorkspaceReviewPersistenceAdapter = runtimeWorkspaceReviewPersistence): Promise<boolean> {
  return persistence.persistReviewGrade(args);
}

function buildReviewSessionAfterGrade(args: {
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

export function buildGradedReviewState(args: {
  snapshot: WorkspaceState;
  currentNodeId: string;
  nodePatch: SharedReviewGradeResult['nodePatch'];
  now: string;
}) {
  const state = args.snapshot;
  const node = state.nodesById[args.currentNodeId];
  if (!node?.review) return null;
  const nextNodesById = {
    ...state.nodesById,
    [args.currentNodeId]: {
      ...node,
      ...args.nodePatch
    }
  };
  const nextQueue = buildCurrentReviewSessionQueueOutput(state, args.now, {
    nodesById: nextNodesById,
    releaseCurrentPin: true
  });
  const nextNodeId = nextQueue.currentNodeId;
  const reviewElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
  const reviewedItemDelta = nextQueue.taskNodeIds.includes(args.currentNodeId) ? 0 : 1;
  const continueNodeId = nextQueue.extensionNodeIds[0] ?? null;
  const nextReviewSession = buildReviewSessionAfterGrade({
    continueNodeId,
    nextDueAt: args.nodePatch.review.due,
    nextNodeId,
    now: args.now,
    queueNodeIds: nextQueue.taskNodeIds,
    reviewElapsedMsDelta,
    reviewSession: args.snapshot.reviewSession,
    reviewedItemDelta
  });
  const activeContext = buildReviewActiveNodeContext(state, nextNodeId ?? continueNodeId);
  return {
    historyEntry: createReviewGradeHistoryEntry({
      afterContext: captureWorkspaceHistoryContext(state, {
        ...activeContext,
        reviewSession: nextReviewSession
      }),
      afterReview: args.nodePatch.review,
      beforeContext: captureWorkspaceHistoryContext(state),
      beforeReview: node.review,
      id: createWorkspaceActionHistoryEntryId(),
      mutationTimestamp: args.now,
      nodeId: args.currentNodeId
    }),
    patch: {
      ...activeContext,
      nodesById: nextNodesById,
      reviewSession: nextReviewSession
    }
  };
}

export function createReadingReviewHistoryEntry(args: {
  afterActiveNodeId: string | null;
  afterBrowseRootNodeId?: string;
  afterReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  beforeReviewSession: WorkspaceState['reviewSession'];
  mutationTimestamp: string;
  nodeId: string;
  relatedReadings?: SequentialReadingChange[];
  state: WorkspaceState;
  title: WorkspaceTopicReadingActionTitle;
}) {
  return createTopicDismissHistoryEntry({
    afterContext: captureWorkspaceHistoryContext(args.state, {
      activeNodeId: args.afterActiveNodeId,
      ...(args.afterBrowseRootNodeId ? { browseRootNodeId: args.afterBrowseRootNodeId } : {}),
      reviewSession: args.afterReviewSession
    }),
    afterReading: args.afterReading,
    beforeContext: captureWorkspaceHistoryContext(args.state, {
      reviewSession: args.beforeReviewSession
    }),
    beforeReading: args.beforeReading,
    id: createWorkspaceActionHistoryEntryId(),
    mutationTimestamp: args.mutationTimestamp,
    nodeId: args.nodeId,
    ...(args.relatedReadings ? { relatedReadings: args.relatedReadings } : {}),
    title: args.title
  });
}
