import { useCallback, useMemo } from 'react';

import { HOME_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

interface WorkspaceDualListViewRootArgs {
  activeNodeId: string | null;
  browseRootNodeId?: string;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

function isFolderNode(nodeId: string | null, nodesById: WorkspaceListNodesById) {
  return Boolean(nodeId && nodesById[nodeId]?.kind === 'folder');
}

function resolvePreferredFolderColumnId(args: {
  browseRootNodeId?: string | undefined;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
}) {
  if (args.isTrashViewOpen || args.isVirtualViewOpen || args.isExternalViewOpen) {
    return null;
  }
  const browseRootNodeId = args.browseRootNodeId ?? HOME_NODE_ID;
  return isFolderNode(browseRootNodeId, args.listNodesById) ? browseRootNodeId : HOME_NODE_ID;
}

export function useWorkspaceDualListViewRoot(args: WorkspaceDualListViewRootArgs) {
  const {
    browseRootNodeId,
    isExternalViewOpen,
    isTrashViewOpen,
    isVirtualViewOpen,
    listNodesById,
    onSelectNode
  } = args;
  const resolvedPreferredFolderColumnId = useMemo(
    () =>
      resolvePreferredFolderColumnId({
        browseRootNodeId,
        isExternalViewOpen,
        isTrashViewOpen,
        isVirtualViewOpen,
        listNodesById
      }),
    [
      browseRootNodeId,
      isExternalViewOpen,
      isTrashViewOpen,
      isVirtualViewOpen,
      listNodesById
    ]
  );

  const selectFolderColumnNode = useCallback((nodeId: string) => {
    onSelectNode(nodeId);
  }, [onSelectNode]);

  return { preferredFolderColumnId: resolvedPreferredFolderColumnId, selectFolderColumnNode };
}
