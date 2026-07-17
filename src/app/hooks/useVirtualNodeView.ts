import { useCallback, useEffect, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../features/nodes/model/specialNodes';

interface VirtualNodeViewArgs {
  browseRootNodeId: string;
  browseRootSpecialKind: Node['specialKind'] | undefined;
  setBrowseRootNode: (nodeId: string) => void;
}

function isVirtualBrowseRoot(args: Pick<VirtualNodeViewArgs, 'browseRootNodeId' | 'browseRootSpecialKind'>) {
  return args.browseRootSpecialKind === 'virtual' ||
    args.browseRootSpecialKind === 'virtual-root' ||
    args.browseRootNodeId === VIRTUAL_REMOVED_NODE_ID ||
    args.browseRootNodeId === VIRTUAL_SHELVED_NODE_ID;
}

export function useVirtualNodeView(args: VirtualNodeViewArgs) {
  const rootIsVirtual = isVirtualBrowseRoot(args);
  const [isVirtualViewOpen, setIsVirtualViewOpen] = useState(rootIsVirtual);

  useEffect(() => {
    setIsVirtualViewOpen(rootIsVirtual);
  }, [args.browseRootNodeId, rootIsVirtual]);

  const openVirtualView = useCallback((nodeId: string = VIRTUAL_ROOT_NODE_ID) => {
    args.setBrowseRootNode(nodeId);
    setIsVirtualViewOpen(true);
  }, [args.setBrowseRootNode]);

  const closeVirtualView = useCallback(() => setIsVirtualViewOpen(false), []);
  const restoreBrowseView = useCallback(() => setIsVirtualViewOpen(rootIsVirtual), [rootIsVirtual]);

  return {
    activeVirtualNodeId: rootIsVirtual ? args.browseRootNodeId : VIRTUAL_ROOT_NODE_ID,
    closeVirtualView,
    isVirtualViewOpen,
    openVirtualView,
    restoreBrowseView
  };
}
