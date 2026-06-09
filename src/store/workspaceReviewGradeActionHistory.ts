import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';

import { cloneReviewSession } from './workspaceDeleteActionHistory';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

const GRADE_REVIEW_ACTION_TITLE = 'Grade Review';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export interface WorkspaceReviewGradeHistoryEntry {
  afterReview: NodeReviewProfile;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeReview: NodeReviewProfile;
  beforeReviewSession: WorkspaceState['reviewSession'];
  nodeId: string;
  title: typeof GRADE_REVIEW_ACTION_TITLE;
  type: 'review.grade';
}

function cloneReviewProfile(review: NodeReviewProfile | null | undefined) {
  return review ? { ...review } : null;
}

function isSameReviewProfile(
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
  afterReview: NodeReviewProfile;
  afterReviewSession: WorkspaceState['reviewSession'];
  beforeReview: NodeReviewProfile;
  beforeReviewSession: WorkspaceState['reviewSession'];
  nodeId: string;
}): WorkspaceReviewGradeHistoryEntry {
  return {
    afterReview: cloneReviewProfile(args.afterReview)!,
    afterReviewSession: cloneReviewSession(args.afterReviewSession)!,
    beforeReview: cloneReviewProfile(args.beforeReview)!,
    beforeReviewSession: cloneReviewSession(args.beforeReviewSession)!,
    nodeId: args.nodeId,
    title: GRADE_REVIEW_ACTION_TITLE,
    type: 'review.grade'
  };
}

function getNavigationPatchAfterApply(
  state: WorkspaceState,
  entry: WorkspaceReviewGradeHistoryEntry,
  mode: 'redo' | 'undo'
) {
  const reviewSession = mode === 'undo' ? entry.beforeReviewSession : entry.afterReviewSession;
  const activeNodeId = reviewSession.currentNodeId ?? entry.nodeId;
  return {
    activeNodeId,
    nodeViewById: markNodeOpenedViewState(state, activeNodeId),
    reviewSession: cloneReviewSession(reviewSession) ?? state.reviewSession
  };
}

export function applyReviewGradeWorkspaceHistory(args: {
  entry: WorkspaceReviewGradeHistoryEntry;
  mode: 'redo' | 'undo';
  now: string;
  popInvalidTopEntry: (history: WorkspaceState['appActionHistory'], mode: 'redo' | 'undo') => WorkspaceState['appActionHistory'];
  set: WorkspaceSet;
  updateHistoryAfterApply: (
    history: WorkspaceState['appActionHistory'],
    entry: WorkspaceReviewGradeHistoryEntry,
    mode: 'redo' | 'undo'
  ) => WorkspaceState['appActionHistory'];
}) {
  let nextNodeForSync: Node | null = null;
  args.set((state) => {
    const node = state.nodesById[args.entry.nodeId];
    const expectedReview = args.mode === 'undo' ? args.entry.afterReview : args.entry.beforeReview;
    const nextReview = args.mode === 'undo' ? args.entry.beforeReview : args.entry.afterReview;
    if (!node || state.trashedNodeIds.includes(args.entry.nodeId) || !isSameReviewProfile(node.review, expectedReview)) {
      return { appActionHistory: args.popInvalidTopEntry(state.appActionHistory, args.mode) };
    }
    nextNodeForSync = {
      ...node,
      review: cloneReviewProfile(nextReview),
      updatedAt: args.now
    };
    return {
      ...getNavigationPatchAfterApply(state, args.entry, args.mode),
      appActionHistory: args.updateHistoryAfterApply(state.appActionHistory, args.entry, args.mode),
      nodesById: {
        ...state.nodesById,
        [args.entry.nodeId]: nextNodeForSync
      }
    };
  });
  if (!nextNodeForSync) return false;
  syncNodeContentToRuntime(nextNodeForSync);
  return true;
}
