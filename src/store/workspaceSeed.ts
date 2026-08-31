import { createInitialNewItemReviewProfile } from '../../lib/core/review/newItemReviewSlots';
import type { NodeReviewProfile } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot, HOME_NODE_ID } from '../features/nodes/model/specialNodes';

import type { WorkspaceLayoutState } from './workspaceStore';

export function createDefaultReviewProfile(timestamp: string): NodeReviewProfile {
  return createInitialNewItemReviewProfile(timestamp);
}

export function createEmptyWorkspaceSnapshot(now: Date, defaultLayoutState: WorkspaceLayoutState) {
  return ensureInboxNodeInSnapshot({
    activeNodeId: null,
    browseRootNodeId: HOME_NODE_ID,
    layout: { ...defaultLayoutState },
    nodeOpenStateById: {},
    nodeViewById: {},
    nodeOrder: [],
    nodesById: {},
    trashedNodeDeletedAtById: {},
    trashedNodeIds: []
  });
}
