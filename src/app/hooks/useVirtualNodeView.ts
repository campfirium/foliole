import { useState } from 'react';

import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';

export function useVirtualNodeView() {
  const [isVirtualViewOpen, setIsVirtualViewOpen] = useState(false);
  const [activeVirtualNodeId, setActiveVirtualNodeId] = useState<string | null>(VIRTUAL_ROOT_NODE_ID);

  const openVirtualView = (nodeId: string = VIRTUAL_ROOT_NODE_ID) => {
    setActiveVirtualNodeId(nodeId);
    setIsVirtualViewOpen(true);
  };

  const closeVirtualView = () => {
    setActiveVirtualNodeId(VIRTUAL_ROOT_NODE_ID);
    setIsVirtualViewOpen(false);
  };

  return {
    activeVirtualNodeId,
    closeVirtualView,
    isVirtualViewOpen,
    openVirtualView,
    setActiveVirtualNodeId
  };
}
