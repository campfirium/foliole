import { matchesFlowHistoryQueues } from '../../lib/core/flow/flowHistorySession';

import type { WorkspaceState } from './workspaceStore';

export interface WorkspaceHistoryContext {
  activeNodeId: string | null;
  browseRootNodeId: string;
  reviewSession: WorkspaceState['reviewSession'];
}

export function cloneWorkspaceReviewSession(reviewSession: WorkspaceState['reviewSession']) {
  return {
    ...reviewSession,
    queueNodeIds: [...reviewSession.queueNodeIds],
    ...(reviewSession.hiddenSoonNodeIds ? { hiddenSoonNodeIds: [...reviewSession.hiddenSoonNodeIds] } : {}),
    ...(reviewSession.soonNodeIds ? { soonNodeIds: [...reviewSession.soonNodeIds] } : {})
  };
}

export function captureWorkspaceHistoryContext(
  state: Pick<WorkspaceState, 'activeNodeId' | 'browseRootNodeId' | 'reviewSession'>,
  patch: Partial<Pick<WorkspaceState, 'activeNodeId' | 'browseRootNodeId' | 'reviewSession'>> = {}
): WorkspaceHistoryContext {
  return {
    activeNodeId: patch.activeNodeId === undefined ? state.activeNodeId : patch.activeNodeId,
    browseRootNodeId: patch.browseRootNodeId ?? state.browseRootNodeId,
    reviewSession: cloneWorkspaceReviewSession(patch.reviewSession ?? state.reviewSession)
  };
}

export function applyWorkspaceHistoryContext(context: WorkspaceHistoryContext) {
  return {
    activeNodeId: context.activeNodeId,
    browseRootNodeId: context.browseRootNodeId,
    reviewSession: cloneWorkspaceReviewSession(context.reviewSession)
  };
}

export function isSameWorkspaceReviewSession(
  left: WorkspaceState['reviewSession'],
  right: WorkspaceState['reviewSession']
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  keys.delete('daily');
  keys.delete('queueNodeIds');
  keys.delete('soonNodeIds');
  keys.delete('queueHistory');
  keys.delete('hiddenSoonNodeIds');
  return [...keys].every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]) &&
    matchesFlowHistoryQueues(right, left) &&
    JSON.stringify(left.hiddenSoonNodeIds ?? []) === JSON.stringify(right.hiddenSoonNodeIds ?? []);
}
