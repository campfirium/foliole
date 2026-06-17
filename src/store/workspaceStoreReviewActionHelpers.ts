import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import {
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceActionHistory';
import { createReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import {
  runtimeWorkspaceReviewPersistence,
  type WorkspaceReviewPersistenceAdapter
} from './workspaceReviewPersistence';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
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

export function applyGradedReviewState(args: {
  set: WorkspaceSet;
  snapshot: WorkspaceState;
  currentNodeId: string;
  nodePatch: SharedReviewGradeResult['nodePatch'];
  reviewedAt: string;
  now: string;
}) {
  args.set((state) => {
    const node = state.nodesById[args.currentNodeId];
    if (!node) return state;
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
    return {
      activeNodeId: nextNodeId ?? continueNodeId ?? state.activeNodeId,
      appActionHistory: pushWorkspaceUndoEntry(
        state.appActionHistory,
        createReviewGradeHistoryEntry({
          afterReview: args.nodePatch.review,
          afterReviewSession: nextReviewSession,
          beforeReview: args.snapshot.nodesById[args.currentNodeId]!.review!,
          beforeReviewSession: args.snapshot.reviewSession,
          nodeId: args.currentNodeId
        })
      ),
      nodesById: nextNodesById,
      reviewSession: nextReviewSession
    };
  });
}

export function createReadingReviewHistoryPatch(args: {
  afterReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeReading: WorkspaceState['nodesById'][string]['reading'] | null | undefined;
  beforeReviewSession: WorkspaceState['reviewSession'];
  nodeId: string;
  state: WorkspaceState;
  title: WorkspaceTopicReadingActionTitle;
}) {
  return {
    appActionHistory: pushWorkspaceUndoEntry(
      args.state.appActionHistory,
      createTopicDismissHistoryEntry({
        afterReading: args.afterReading,
        afterReviewSession: args.afterReviewSession,
        beforeReading: args.beforeReading,
        beforeReviewSession: args.beforeReviewSession,
        nodeId: args.nodeId,
        title: args.title
      })
    )
  };
}
