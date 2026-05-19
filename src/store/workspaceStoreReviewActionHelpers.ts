import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade } from '../features/review/model/reviewTypes';

import {
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceActionHistory';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export async function persistReviewGradeMutation(args: {
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  cardBefore: ReturnType<typeof toSchedulerCard>;
  cardAfter: ReturnType<typeof toSchedulerCard>;
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
  nextNodeId: string | null;
  nextQueue: string[];
  nextReviewProfile: ReturnType<typeof toNodeReviewProfile>;
  reviewedAt: string;
  now: string;
}) {
  args.set((state) => {
    const node = state.nodesById[args.currentNodeId];
    if (!node) return state;
    return {
      activeNodeId: args.nextNodeId ?? state.activeNodeId,
      nodesById: {
        ...state.nodesById,
        [args.currentNodeId]: {
          ...node,
          review: { ...args.nextReviewProfile, lastReviewAt: args.reviewedAt },
          updatedAt: args.now
        }
      },
      reviewSession: args.nextNodeId
        ? advanceReviewSession(args.snapshot.reviewSession, {
            nextNodeId: args.nextNodeId,
            queueNodeIds: args.nextQueue,
            reviewedItemDelta: 1
          })
        : completeReviewSession(args.snapshot.reviewSession, {
            completedAt: args.now,
            reviewedItemDelta: 1
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
