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

function isSameStringArray(left: string[] | undefined, right: string[] | undefined) {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function isSameWorkspaceReviewSession(
  left: WorkspaceState['reviewSession'],
  right: WorkspaceState['reviewSession']
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  keys.delete('queueNodeIds');
  keys.delete('soonNodeIds');
  return [...keys].every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]) &&
    isSameStringArray(left.queueNodeIds, right.queueNodeIds) &&
    isSameStringArray(left.soonNodeIds, right.soonNodeIds);
}
