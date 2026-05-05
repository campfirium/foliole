import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade, type ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import { buildReviewQueuePlan } from './reviewQueuePlanner';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceGet = () => WorkspaceState;

type WorkspaceReviewActions = Pick<
  WorkspaceState,
  'exitReviewSession' | 'gradeReviewCard' | 'revealReviewAnswer' | 'startReviewSession'
>;

function createEmptyReviewSession(): WorkspaceState['reviewSession'] {
  return {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: [],
    totalNodeCount: 0
  };
}

function buildReviewQueue(state: WorkspaceState, now: string): string[] {
  return buildReviewQueuePlan({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    now,
    trashedNodeIds: state.trashedNodeIds
  }).queueNodeIds;
}

function createStartReviewSessionAction(set: WorkspaceSet): WorkspaceReviewActions['startReviewSession'] {
  return (now = new Date().toISOString()) => {
    let started = false;
    set((state) => {
      const queueNodeIds = buildReviewQueue(state, now);
      if (queueNodeIds.length === 0) {
        return state;
      }
      started = true;
      return {
        activeNodeId: queueNodeIds[0] ?? state.activeNodeId,
        reviewSession: {
          currentNodeId: queueNodeIds[0] ?? null,
          isAnswerRevealed: false,
          queueNodeIds,
          totalNodeCount: queueNodeIds.length
        }
      };
    });
    return started;
  };
}

function createRevealReviewAnswerAction(set: WorkspaceSet): WorkspaceReviewActions['revealReviewAnswer'] {
  return () => {
    set((state) => {
      if (!state.reviewSession.currentNodeId) {
        return state;
      }
      return {
        reviewSession: {
          ...state.reviewSession,
          isAnswerRevealed: true
        }
      };
    });
  };
}

async function persistReviewGradeMutation(args: {
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

function applyGradedReviewState(args: {
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
    if (!node) {
      return state;
    }
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
        ? {
            currentNodeId: args.nextNodeId,
            isAnswerRevealed: false,
            queueNodeIds: args.nextQueue,
            totalNodeCount: args.snapshot.reviewSession.totalNodeCount
          }
        : createEmptyReviewSession()
    };
  });
}

function createGradeReviewCardAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter
): WorkspaceReviewActions['gradeReviewCard'] {
  return async (grade: ReviewGrade, now = new Date().toISOString()) => {
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) {
      return false;
    }

    const currentNode = snapshot.nodesById[currentNodeId];
    if (!currentNode || currentNode.reveal === null) {
      return false;
    }

    const cardBefore = toSchedulerCard(currentNode.review, now);
    const result = await scheduler.grade({ card: cardBefore, grade, now });
    try {
      await persistReviewGradeMutation({
        currentNodeId,
        grade,
        reviewedAt: result.reviewed_at,
        cardBefore,
        cardAfter: result.card
      });
    } catch {
      return false;
    }
    const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
    const nextNodeId = nextQueue[0] ?? null;
    const nextReviewProfile = toNodeReviewProfile(result.card);
    applyGradedReviewState({
      set,
      snapshot,
      currentNodeId,
      nextNodeId,
      nextQueue,
      nextReviewProfile,
      reviewedAt: result.reviewed_at,
      now
    });

    return true;
  };
}

function createExitReviewSessionAction(set: WorkspaceSet): WorkspaceReviewActions['exitReviewSession'] {
  return () => {
    set(() => ({
      reviewSession: createEmptyReviewSession()
    }));
  };
}

export function createWorkspaceReviewActions(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter = createReviewSchedulerAdapter()
): WorkspaceReviewActions {
  return {
    startReviewSession: createStartReviewSessionAction(set),
    revealReviewAnswer: createRevealReviewAnswerAction(set),
    gradeReviewCard: createGradeReviewCardAction(set, get, scheduler),
    exitReviewSession: createExitReviewSessionAction(set)
  };
}
