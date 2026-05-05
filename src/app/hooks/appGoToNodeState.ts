import { buildGoToNodeState } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export interface AppGoToNodeState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
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
    args.ws.trashedNodeIds,
    () => args.runtime.setIsGoToNodePaletteOpen(false),
    (nodeId) => {
      args.trash.closeTrashView();
      args.ws.openNode(nodeId);
      args.runtime.setIsGoToNodePaletteOpen(false);
    }
  );
}
