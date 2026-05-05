import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { buildSearchState, toSearchNodesById } from './appControllerHelpers';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export interface AppSearchState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}

export function buildControllerSearchState(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}): AppSearchState {
  return buildSearchState(
    args.runtime.isSearchPaletteOpen,
    args.ws.nodeOrder,
    toSearchNodesById(args.ws.nodesById),
    args.ws.trashedNodeIds,
    () => args.runtime.setIsSearchPaletteOpen(false),
    (nodeId) => {
      args.trash.closeTrashView();
      args.ws.openNode(nodeId);
      args.runtime.setIsSearchPaletteOpen(false);
    }
  );
}
