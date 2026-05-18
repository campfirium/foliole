import { useWorkspaceStore } from '../../store/workspaceStore';

import { DocumentRestoreAction } from './DocumentRestoreAction';

export function TrashDocumentRestoreAction({
  activeNodeId,
  isTrashViewOpen,
  onSelectNode,
  trashedNodeIds
}: {
  activeNodeId: string | null;
  isTrashViewOpen?: boolean;
  onSelectNode: (nodeId: string) => void;
  trashedNodeIds: string[];
}) {
  const restoreNode = useWorkspaceStore((state) => state.restoreNode);
  const restorableTrashNodeId = isTrashViewOpen &&
    activeNodeId &&
    trashedNodeIds.includes(activeNodeId)
    ? activeNodeId
    : null;

  return restorableTrashNodeId
    ? (
        <DocumentRestoreAction
          onRestore={async () => {
            const targetNodeId = await restoreNode(restorableTrashNodeId);
            onSelectNode(targetNodeId ?? restorableTrashNodeId);
          }}
        />
      )
    : null;
}
