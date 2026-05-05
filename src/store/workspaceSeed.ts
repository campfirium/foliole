import type { NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';

import type { WorkspaceLayoutState } from './workspaceStore';

export function createDefaultReviewProfile(timestamp: string): NodeReviewProfile {
  return {
    due: timestamp,
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  };
}

export function createEmptyWorkspaceSnapshot(now: Date, defaultLayoutState: WorkspaceLayoutState) {
  const timestamp = now.toISOString();
  return ensureInboxNodeInSnapshot({
    activeNodeId: null,
    layout: { ...defaultLayoutState },
    nodeViewById: {},
    nodeOrder: [],
    nodesById: {},
    trashedNodeIds: []
  });
}
