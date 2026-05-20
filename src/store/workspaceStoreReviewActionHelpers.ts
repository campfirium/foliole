import { isFsrsReviewItemNode } from '../features/review/model/reviewItemKind';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade } from '../features/review/model/reviewTypes';

import {
  createTopicDismissHistoryEntry,
  pushWorkspaceUndoEntry,
  type WorkspaceTopicReadingActionTitle
} from './workspaceActionHistory';
import { buildCurrentReviewSessionQueue } from './workspaceReviewLiveQueue';
import { advanceReviewSession, completeReviewSession } from './workspaceReviewReading';
import { calculateReviewStepElapsedMs } from './workspaceReviewSessionProgress';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function hasRemainingReviewCards(
  queueNodeIds: string[],
  nodesById: WorkspaceState['nodesById']
) {
  return queueNodeIds.some((nodeId) => isFsrsReviewItemNode(nodesById[nodeId]));
}

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
  nextReviewProfile: ReturnType<typeof toNodeReviewProfile>;
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
        review: { ...args.nextReviewProfile, lastReviewAt: args.reviewedAt },
        updatedAt: args.now
      }
    };
    const nextQueue = buildCurrentReviewSessionQueue(state, args.now, { nodesById: nextNodesById });
    const nextNodeId = nextQueue[0] ?? null;
    const reviewElapsedMsDelta = calculateReviewStepElapsedMs(args.snapshot.reviewSession, args.now);
    return {
      activeNodeId: nextNodeId ?? state.activeNodeId,
      nodesById: nextNodesById,
      reviewSession: nextNodeId && hasRemainingReviewCards(nextQueue, nextNodesById)
        ? advanceReviewSession(args.snapshot.reviewSession, {
            handledAt: args.now,
            nextNodeId,
            queueNodeIds: nextQueue,
            reviewElapsedMsDelta,
            reviewedItemDelta: 1
          })
        : completeReviewSession(args.snapshot.reviewSession, {
            completedAt: args.now,
            continueNodeId: nextNodeId,
            reviewElapsedMsDelta,
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
