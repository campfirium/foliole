import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import type { WorkspaceState } from '../../store/workspaceStore';

export function createVirtualFolderCommand(args: {
  createVirtualNode: WorkspaceState['createVirtualNode'];
  onOpenVirtualView: (nodeId?: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
}) {
  return async () => {
    const nodeId = await args.createVirtualNode({ mode: 'manual' });
    if (!nodeId) return;
    args.onOpenVirtualView(nodeId);
    args.onSelectNodeInVirtualView(nodeId);
    window.requestAnimationFrame(() => requestNodeRename(nodeId));
  };
}
