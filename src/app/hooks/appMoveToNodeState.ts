import { canNodeAcceptMovedChildren } from '../../features/nodes/model/nodeContainers';
import { isNodeInSubtree } from '../../store/workspaceNodeTreeOrder';

import { buildGoToNodeState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import type { AppGoToNodeState } from './appGoToNodeState';

export function buildControllerMoveToNodeState(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): AppGoToNodeState {
  const activeNodeId = args.ws.activeNodeId;
  const targetNodeOrder = activeNodeId
    ? args.ws.nodeOrder.filter((nodeId) => {
        if (
          nodeId === activeNodeId ||
          args.ws.trashedNodeIds.includes(nodeId)
        ) {
          return false;
        }
        if (isNodeInSubtree(nodeId, activeNodeId, args.ws.nodesById as Record<string, import('../../features/nodes/model/nodeTypes').Node>)) {
          return false;
        }
        return canNodeAcceptMovedChildren(nodeId, args.ws.nodeOrder, args.ws.nodesById);
      })
    : [];

  return buildGoToNodeState(
    args.runtime.isMoveToNodePaletteOpen,
    targetNodeOrder,
    args.ws.nodesById,
    args.runtime.recentNodeIds,
    args.ws.trashedNodeIds,
    () => args.runtime.setIsMoveToNodePaletteOpen(false),
    (nodeId) => {
      if (!args.ws.activeNodeId) {
        return;
      }
      args.runtime.recordRecentNode(nodeId);
      args.ws.moveNode(args.ws.activeNodeId, nodeId);
      args.runtime.setIsMoveToNodePaletteOpen(false);
    }
  );
}
