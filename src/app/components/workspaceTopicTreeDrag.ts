import { useMemo } from 'react';

import { useNodeListDragController } from '../../features/nodes/components/NodeListTreeDrag';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { definedProps } from '../../shared/lib/definedProps';

import {
  createWorkspaceTopicTreeManualMove,
  type WorkspaceTopicTreeManualMoveIntent
} from './workspaceTopicTreeManualDrag';

export function useWorkspaceTopicTreeDrag(args: {
  activeFolderId: string;
  itemIds: string[];
  isManualSort: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: WorkspaceTopicTreeManualMoveIntent) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  selectedNodeIds: string[];
  setFolderManualChildOrder?: (folderNodeId: string, manualChildOrder: string[]) => boolean;
}) {
  const moveNodes = useMemo(() => {
    const parentNodeIdById = Object.fromEntries(
      Object.values(args.nodesById)
        .flatMap((node) => node ? [[node.id, node.parentNodeId ?? null]] : [])
    );
    return createWorkspaceTopicTreeManualMove({
      activeFolderId: args.activeFolderId,
      currentOrder: args.itemIds,
      isManualSort: args.isManualSort,
      moveNodes: args.moveNodes,
      parentNodeIdById,
      ...definedProps({ setFolderManualChildOrder: args.setFolderManualChildOrder })
    });
  }, [args.activeFolderId, args.isManualSort, args.itemIds, args.moveNodes, args.nodesById, args.setFolderManualChildOrder]);

  return useNodeListDragController({
    disableRootDrop: true,
    isTrashViewOpen: false,
    moveNodes,
    nodesById: args.nodesById,
    noteRowIds: args.itemIds,
    selectedNodeIds: args.selectedNodeIds
  });
}
