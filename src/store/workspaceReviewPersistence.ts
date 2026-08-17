import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';
import { saveNodeReadingStateToRuntime } from '../shared/platform/runtime/nodeReadingStateRuntimeRepository';

import { WorkspacePartialPersistenceError } from './workspacePersistenceFailure';
import { syncReviewGradeToRuntime } from './workspaceRuntimeSync';

export interface WorkspaceReviewGradePersistencePayload {
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
  cardBefore: SchedulerCard;
  cardAfter: SchedulerCard;
}

export interface WorkspaceReviewPersistenceAdapter {
  persistReadingNodes: (nodes: Node[], updatedAt?: string) => Promise<boolean>;
  persistReviewGrade: (payload: WorkspaceReviewGradePersistencePayload) => Promise<boolean>;
}

async function persistRuntimeReadingNodes(nodes: Node[], updatedAt?: string) {
  for (const [index, node] of nodes.entries()) {
    try {
      const persisted = await saveNodeReadingStateToRuntime({
        nodeId: node.id,
        reading: node.reading ?? null,
        updatedAt: updatedAt ?? node.reading?.lastHandledAt ?? new Date().toISOString()
      });
      if (!persisted) {
        if (index > 0) throw new WorkspacePartialPersistenceError();
        return false;
      }
    } catch (error) {
      if (index > 0 && !(error instanceof WorkspacePartialPersistenceError)) {
        throw new WorkspacePartialPersistenceError();
      }
      throw error;
    }
  }
  return true;
}

async function persistRuntimeReviewGrade(payload: WorkspaceReviewGradePersistencePayload) {
  await syncReviewGradeToRuntime({
    nodeId: payload.currentNodeId,
    grade: payload.grade,
    reviewedAt: payload.reviewedAt,
    schedulerVersion: payload.schedulerVersion,
    cardBefore: payload.cardBefore,
    cardAfter: payload.cardAfter
  });
  return true;
}

export const runtimeWorkspaceReviewPersistence: WorkspaceReviewPersistenceAdapter = {
  persistReadingNodes: persistRuntimeReadingNodes,
  persistReviewGrade: persistRuntimeReviewGrade
};

export const browserLocalWorkspaceReviewPersistence: WorkspaceReviewPersistenceAdapter = {
  persistReadingNodes: async () => true,
  persistReviewGrade: async () => true
};
