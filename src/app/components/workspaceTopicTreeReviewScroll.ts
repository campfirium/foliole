import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceTopicTreeScrollPlacement } from './WorkspaceTopicTreeRows';

export function resolveWorkspaceTopicTreeReviewScroll(args: {
  focusedNodeId: string | null;
  forceVisibleNodeId: string | null | undefined;
  nodesById: WorkspaceListNodesById;
  rows: readonly NodeTreeRow[];
}): {
  placement: WorkspaceTopicTreeScrollPlacement;
  scrollNodeId: string | null;
} {
  if (!args.forceVisibleNodeId || args.forceVisibleNodeId !== args.focusedNodeId) {
    return { placement: 'comfort', scrollNodeId: args.focusedNodeId };
  }

  const focusedNode = args.focusedNodeId ? args.nodesById[args.focusedNodeId] : null;
  const parentNodeId = focusedNode?.parentNodeId ?? null;
  const parentRowIndex = findRowIndex(args.rows, parentNodeId);

  if (parentNodeId && parentRowIndex !== null) {
    return { placement: 'comfort', scrollNodeId: parentNodeId };
  }

  return {
    placement: 'comfort',
    scrollNodeId: args.focusedNodeId
  };
}

function findRowIndex(rows: readonly NodeTreeRow[], nodeId: string | null | undefined) {
  if (!nodeId) {
    return null;
  }
  const index = rows.findIndex((row) => row.node.id === nodeId);
  return index < 0 ? null : index;
}
