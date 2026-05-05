import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { buildSearchState, toSearchNodesById } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';

interface SearchStateArgs {
  nav: {
    handleSelectNode: (nodeId: string) => void;
  };
  runtime: {
    isSearchPaletteOpen: boolean;
    setIsSearchPaletteOpen: (open: boolean) => void;
  };
  trash: {
    closeTrashView: () => void;
  };
  ws: {
    nodeOrder: string[];
    nodesById: ReturnType<typeof useWorkspaceSelectors>['nodesById'];
    trashedNodeIds: string[];
  };
}

export interface AppSearchState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}

export function buildControllerSearchState(args: SearchStateArgs): AppSearchState {
  return buildSearchState(
    args.runtime.isSearchPaletteOpen,
    args.ws.nodeOrder,
    toSearchNodesById(args.ws.nodesById),
    args.ws.trashedNodeIds,
    () => args.runtime.setIsSearchPaletteOpen(false),
    (nodeId) => {
      args.trash.closeTrashView();
      args.nav.handleSelectNode(nodeId);
      args.runtime.setIsSearchPaletteOpen(false);
    }
  );
}
