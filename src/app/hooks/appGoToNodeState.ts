import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { buildGoToNodeState } from './appControllerHelpers';
import type { useWorkspaceSelectors } from './appControllerState';

interface GoToNodeStateArgs {
  nav: {
    handleSelectNode: (nodeId: string) => void;
  };
  runtime: {
    isGoToNodePaletteOpen: boolean;
    recentNodeIds: string[];
    recordRecentNode: (nodeId: string) => void;
    setIsGoToNodePaletteOpen: (open: boolean) => void;
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

export interface AppGoToNodeState {
  isOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onClose: () => void;
  onOpenNode: (nodeId: string) => void;
  recentNodeIds: string[];
  trashedNodeIds: string[];
}

export function buildControllerGoToNodeState(args: GoToNodeStateArgs): AppGoToNodeState {
  const isOpen = args.runtime.isGoToNodePaletteOpen;
  return buildGoToNodeState(
    isOpen,
    isOpen ? args.ws.nodeOrder : [],
    isOpen ? args.ws.nodesById : {},
    args.runtime.recentNodeIds,
    args.ws.trashedNodeIds,
    () => args.runtime.setIsGoToNodePaletteOpen(false),
    (nodeId) => {
      args.runtime.recordRecentNode(nodeId);
      args.trash.closeTrashView();
      args.nav.handleSelectNode(nodeId);
      args.runtime.setIsGoToNodePaletteOpen(false);
    }
  );
}
