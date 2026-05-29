import { useCallback, useEffect, useMemo, useState } from 'react';

import { HOME_NODE_ID, isHomeNode } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

interface WorkspaceDualListViewRootArgs {
  activeNodeId: string | null;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

function isFolderNode(nodeId: string | null, nodesById: WorkspaceListNodesById) {
  return Boolean(nodeId && nodesById[nodeId]?.kind === 'folder');
}

function isNodeWithinFolderRoot(
  nodeId: string | null,
  folderNodeId: string | null,
  nodesById: WorkspaceListNodesById
) {
  if (!nodeId || !folderNodeId || !nodesById[folderNodeId]) {
    return false;
  }
  if (folderNodeId === HOME_NODE_ID || isHomeNode(nodesById[folderNodeId])) {
    return true;
  }

  let currentNodeId: string | null = nodeId;
  while (currentNodeId) {
    if (currentNodeId === folderNodeId) {
      return true;
    }
    currentNodeId = nodesById[currentNodeId]?.parentNodeId ?? null;
  }
  return false;
}

function resolvePreferredFolderColumnId(args: {
  activeNodeId: string | null;
  isExternalViewOpen: boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  listNodesById: WorkspaceListNodesById;
  preferredFolderColumnId: string | null;
}) {
  if (args.isTrashViewOpen || args.isVirtualViewOpen || args.isExternalViewOpen) {
    return args.preferredFolderColumnId;
  }
  if (isFolderNode(args.activeNodeId, args.listNodesById)) {
    return args.activeNodeId;
  }
  return isNodeWithinFolderRoot(args.activeNodeId, args.preferredFolderColumnId, args.listNodesById)
    ? args.preferredFolderColumnId
    : null;
}

export function useWorkspaceDualListViewRoot(args: WorkspaceDualListViewRootArgs) {
  const [preferredFolderColumnId, setPreferredFolderColumnId] = useState<string | null>(null);
  const {
    activeNodeId,
    isExternalViewOpen,
    isTrashViewOpen,
    isVirtualViewOpen,
    listNodesById,
    onSelectNode
  } = args;
  const resolvedPreferredFolderColumnId = useMemo(
    () =>
      resolvePreferredFolderColumnId({
        activeNodeId,
        isExternalViewOpen,
        isTrashViewOpen,
        isVirtualViewOpen,
        listNodesById,
        preferredFolderColumnId
      }),
    [
      activeNodeId,
      isExternalViewOpen,
      isTrashViewOpen,
      isVirtualViewOpen,
      listNodesById,
      preferredFolderColumnId
    ]
  );

  useEffect(() => {
    if (isTrashViewOpen || isVirtualViewOpen || isExternalViewOpen) {
      return;
    }
    if (isFolderNode(activeNodeId, listNodesById)) {
      setPreferredFolderColumnId(activeNodeId);
      return;
    }
    setPreferredFolderColumnId((current) =>
      isNodeWithinFolderRoot(activeNodeId, current, listNodesById) ? current : null
    );
  }, [
    activeNodeId,
    isExternalViewOpen,
    isTrashViewOpen,
    isVirtualViewOpen,
    listNodesById
  ]);

  const selectFolderColumnNode = useCallback((nodeId: string) => {
    setPreferredFolderColumnId(nodeId);
    onSelectNode(nodeId);
  }, [onSelectNode]);

  return { preferredFolderColumnId: resolvedPreferredFolderColumnId, selectFolderColumnNode };
}
