import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node, NodeReviewProfile } from '../features/nodes/model/nodeTypes';
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

export function createSeedNode(timestamp: string): Node {
  const seedContent = '# Welcome to Foliole\n\nStart writing markdown here.';
  return {
    id: 'node-1',
    parentNodeId: null,
    title: deriveNodeTitleFromContent(seedContent),
    content: seedContent,
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createInitialWorkspaceSnapshot(now: Date, defaultLayoutState: WorkspaceLayoutState) {
  const timestamp = now.toISOString();
  const seedNode = createSeedNode(timestamp);
  return ensureInboxNodeInSnapshot({
    activeNodeId: seedNode.id,
    layout: { ...defaultLayoutState },
    nodeViewById: {},
    nodeOrder: [seedNode.id],
    nodesById: { [seedNode.id]: seedNode },
    trashedNodeIds: []
  });
}
