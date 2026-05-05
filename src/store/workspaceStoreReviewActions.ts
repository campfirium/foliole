import { createReviewSchedulerAdapter } from '../features/review/model/reviewSchedulerFactory';
import { toNodeReviewProfile, toSchedulerCard, type ReviewGrade, type ReviewSchedulerAdapter } from '../features/review/model/reviewTypes';

import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type WorkspaceGet = () => WorkspaceState;

function createEmptyReviewSession(): WorkspaceState['reviewSession'] {
  return {
    currentNodeId: null,
    isAnswerRevealed: false,
    queueNodeIds: []
  };
}

function buildReviewQueue(state: WorkspaceState, now: string): string[] {
  return state.nodeOrder.filter((nodeId) => {
    if (state.trashedNodeIds.includes(nodeId)) {
      return false;
    }
    const node = state.nodesById[nodeId];
    if (!node || node.reveal === null) {
      return false;
    }
    const due = node.review?.due ?? now;
    return due <= now;
  });
}

export function createWorkspaceReviewActions(
  set: WorkspaceSet,
  get: WorkspaceGet,
  scheduler: ReviewSchedulerAdapter = createReviewSchedulerAdapter()
): Pick<WorkspaceState, 'exitReviewSession' | 'gradeReviewCard' | 'revealReviewAnswer' | 'startReviewSession'> {
  return {
    startReviewSession: (now = new Date().toISOString()) => {
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
            queueNodeIds
          }
        };
      });
      return started;
    },
    revealReviewAnswer: () => {
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
    },
    gradeReviewCard: async (grade: ReviewGrade, now = new Date().toISOString()) => {
      const snapshot = get();
      const currentNodeId = snapshot.reviewSession.currentNodeId;
      if (!currentNodeId || !snapshot.reviewSession.isAnswerRevealed) {
        return false;
      }

      const currentNode = snapshot.nodesById[currentNodeId];
      if (!currentNode || currentNode.reveal === null) {
        return false;
      }

      const result = await scheduler.grade({
        card: toSchedulerCard(currentNode.review, now),
        grade,
        now
      });

      const nextQueue = snapshot.reviewSession.queueNodeIds.filter((nodeId) => nodeId !== currentNodeId);
      const nextNodeId = nextQueue[0] ?? null;
      const nextReviewProfile = toNodeReviewProfile(result.card);

      set((state) => {
        const node = state.nodesById[currentNodeId];
        if (!node) {
          return state;
        }
        return {
          activeNodeId: nextNodeId ?? state.activeNodeId,
          nodesById: {
            ...state.nodesById,
            [currentNodeId]: {
              ...node,
              review: {
                ...nextReviewProfile,
                lastReviewAt: result.reviewed_at
              },
              updatedAt: now
            }
          },
          reviewSession: nextNodeId
            ? {
                currentNodeId: nextNodeId,
                isAnswerRevealed: false,
                queueNodeIds: nextQueue
              }
            : createEmptyReviewSession()
        };
      });

      return true;
    },
    exitReviewSession: () => {
      set(() => ({
        reviewSession: createEmptyReviewSession()
      }));
    }
  };
}
