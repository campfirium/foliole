import type { NodeTreeRow } from '../../features/nodes/model/nodeTree';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import type { WorkspaceTopicTreeScrollPlacement } from './WorkspaceTopicTreeRows';

const DERIVED_PARENT_SECOND_ROW_MAX_DISTANCE = 16;

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
  const parentNodeId = focusedNode?.anchorLink ? focusedNode.parentNodeId : null;
  const focusedRowIndex = findRowIndex(args.rows, args.focusedNodeId);
  const parentRowIndex = findRowIndex(args.rows, parentNodeId);

  if (
    parentNodeId &&
    parentRowIndex !== null &&
    focusedRowIndex !== null &&
    focusedRowIndex - parentRowIndex <= DERIVED_PARENT_SECOND_ROW_MAX_DISTANCE
  ) {
    return { placement: 'second-visible-row', scrollNodeId: parentNodeId };
  }

  return {
    placement: parentNodeId ? 'near-visible-row' : 'second-visible-row',
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
