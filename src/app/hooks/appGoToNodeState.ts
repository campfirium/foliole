import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { buildGoToNodeState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export interface AppGoToNodeState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  recentNodeIds: string[];
  trashedNodeIds: string[];
}

export function buildControllerGoToNodeState(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): AppGoToNodeState {
  return buildGoToNodeState(
    args.runtime.isGoToNodePaletteOpen,
    args.ws.nodeOrder,
    args.ws.nodesById,
    args.runtime.recentNodeIds,
    args.ws.trashedNodeIds,
    () => args.runtime.setIsGoToNodePaletteOpen(false),
    (nodeId) => {
      args.runtime.recordRecentNode(nodeId);
      args.trash.closeTrashView();
      args.ws.openNode(nodeId);
      args.runtime.setIsGoToNodePaletteOpen(false);
    }
  );
}
