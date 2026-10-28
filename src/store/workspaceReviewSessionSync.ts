import type { WorkspaceState } from './workspaceStore';

// Membership edits invalidate durable Flow; the service alone selects its successor.
// Legacy persisted sessions remain intact until the service validates their restoration facts.
export function reconcileReviewSession(state: WorkspaceState, _nextActiveNodeId: string | null = state.activeNodeId) {
  void _nextActiveNodeId;
  return state.reviewSession;
}
