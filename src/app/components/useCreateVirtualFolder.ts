import { useEffect, useState } from 'react';

import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useCreateVirtualFolder(args: {
  failedMessage: string;
  nodesById: WorkspaceListNodesById;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  setStatus: (status: string | null) => void;
}) {
  const [pendingRenameNodeId, setPendingRenameNodeId] = useState<string | null>(null);
  const createVirtualNode = useWorkspaceStore((state) => state.createVirtualNode);

  useEffect(() => {
    if (!pendingRenameNodeId || !args.nodesById[pendingRenameNodeId]) return;
    requestNodeRename(pendingRenameNodeId);
    setPendingRenameNodeId(null);
  }, [args.nodesById, pendingRenameNodeId]);

  return async (parentNodeId?: string) => {
    args.setStatus(null);
    const nodeId = await createVirtualNode({ mode: 'manual', ...(parentNodeId ? { parentNodeId } : {}) });
    if (!nodeId) {
      args.setStatus(args.failedMessage);
      return;
    }
    args.onOpenVirtualView?.(nodeId);
    args.onSelectNodeInVirtualView(nodeId);
    setPendingRenameNodeId(nodeId);
  };
}
