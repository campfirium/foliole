import type { Node } from '../features/nodes/model/nodeTypes';
import type { ReviewGrade, SchedulerCard } from '../features/review/model/reviewTypes';

import { syncNodeContentToRuntimeNow, syncReviewGradeToRuntime } from './workspaceRuntimeSync';

export interface WorkspaceReviewGradePersistencePayload {
  currentNodeId: string;
  grade: ReviewGrade;
  reviewedAt: string;
  schedulerVersion: string;
  cardBefore: SchedulerCard;
  cardAfter: SchedulerCard;
}

export interface WorkspaceReviewPersistenceAdapter {
  persistReadingNodes: (nodes: Node[]) => Promise<boolean>;
  persistReviewGrade: (payload: WorkspaceReviewGradePersistencePayload) => Promise<boolean>;
}

async function persistRuntimeReadingNodes(nodes: Node[]) {
  for (const node of nodes) {
    const persisted = await syncNodeContentToRuntimeNow(node);
    if (!persisted) return false;
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
