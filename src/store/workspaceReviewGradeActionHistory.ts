import type { NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import type { WorkspaceHistoryContext } from './workspaceHistoryContext';
import { cloneWorkspaceReviewSession } from './workspaceHistoryContext';

const GRADE_REVIEW_ACTION_TITLE = 'Grade Review';

export interface WorkspaceReviewGradeHistoryEntry {
  afterContext: WorkspaceHistoryContext;
  afterReview: NodeReviewProfile;
  beforeContext: WorkspaceHistoryContext;
  beforeReview: NodeReviewProfile;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
  title: typeof GRADE_REVIEW_ACTION_TITLE;
  type: 'review.grade';
}

export function cloneReviewProfile(review: NodeReviewProfile | null | undefined) {
  return review ? { ...review } : null;
}

export function isSameReviewProfile(
  left: NodeReviewProfile | null | undefined,
  right: NodeReviewProfile | null | undefined
) {
  if (!left || !right) return left === right;
  return (
    left.due === right.due &&
    left.lastReviewAt === right.lastReviewAt &&
    left.state === right.state &&
    left.stability === right.stability &&
    left.difficulty === right.difficulty &&
    left.elapsedDays === right.elapsedDays &&
    left.scheduledDays === right.scheduledDays &&
    left.reps === right.reps &&
    left.lapses === right.lapses
  );
}

export function createReviewGradeHistoryEntry(args: {
  afterContext: WorkspaceHistoryContext;
  afterReview: NodeReviewProfile;
  beforeContext: WorkspaceHistoryContext;
  beforeReview: NodeReviewProfile;
  id: string;
  mutationTimestamp: string;
  nodeId: string;
}): WorkspaceReviewGradeHistoryEntry {
  return {
    afterContext: { ...args.afterContext, reviewSession: cloneWorkspaceReviewSession(args.afterContext.reviewSession) },
    afterReview: cloneReviewProfile(args.afterReview)!,
    beforeContext: { ...args.beforeContext, reviewSession: cloneWorkspaceReviewSession(args.beforeContext.reviewSession) },
    beforeReview: cloneReviewProfile(args.beforeReview)!,
    id: args.id,
    mutationTimestamp: args.mutationTimestamp,
    nodeId: args.nodeId,
    title: GRADE_REVIEW_ACTION_TITLE,
    type: 'review.grade'
  };
}
