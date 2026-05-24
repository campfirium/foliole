import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';
import type { SharedReviewGradeResult } from '../features/review/model/sharedReviewGradeService';

import {
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceActionHistory';
import { buildCurrentReviewSessionQueueOutput } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export async function persistReviewGradeMutation(args: {
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  cardBefore: SchedulerCard;
  cardAfter: SchedulerCard;
}): Promise<void> {
  await syncReviewGradeToRuntime({
    nodeId: args.currentNodeId,
    grade: args.grade,
    reviewedAt: args.reviewedAt,
    cardBefore: args.cardBefore,
    cardAfter: args.cardAfter
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
    return {
      activeNodeId: nextNodeId ?? continueNodeId ?? state.activeNodeId,
      nodesById: nextNodesById,
      reviewSession: nextNodeId
        ? advanceReviewSession(args.snapshot.reviewSession, {
            handledAt: args.now,
            nextNodeId,
            queueNodeIds: nextQueue.taskNodeIds,
            reviewElapsedMsDelta,
            reviewedItemDelta
          })
        : completeReviewSession(args.snapshot.reviewSession, {
            completedAt: args.now,
            continueNodeId,
            reviewElapsedMsDelta,
            reviewedItemDelta
          })
    };
  });
}

export function createReadingReviewHistoryPatch(args: {
  afterReading: NonNullable<WorkspaceState['nodesById'][string]['reading']>;
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
