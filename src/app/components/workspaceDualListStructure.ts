import {
  HOME_NODE_ID,
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  isHomeNode,
  isInboxNode,
  isTrashNode,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import { selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import {
  buildWorkspaceListChildrenIndex,
  type WorkspaceListChildrenIndex
} from './workspaceListChildrenIndex';

export interface WorkspaceDualListStructureArgs {
  listNodesById: WorkspaceListNodesById;
  nodeOrder: string[];
  trashedNodeIds: string[];
}

export interface WorkspaceDualListStructureData {
  folderNodeOrder: string[];
  folderTopicCountById: Map<string, number>;
  listIndex: WorkspaceListChildrenIndex;
}

function isVisibleFolderId(nodeId: string, nodesById: WorkspaceListNodesById) {
  const node = nodesById[nodeId];
  return Boolean(
    node?.kind === 'folder' &&
    !isVirtualRootNode(node) &&
    !isVirtualNode(node)
  );
}

function buildFolderNodeOrderFromIndex(
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  const regularFolderIds = index.visibleNodeIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return (
      isVisibleFolderId(nodeId, nodesById) &&
      nodeId !== HOME_NODE_ID &&
      nodeId !== INBOX_NODE_ID &&
      nodeId !== TRASH_NODE_ID &&
      !isHomeNode(node) &&
      !isInboxNode(node) &&
      !isTrashNode(node)
    );
  });

  return [
    ...(index.visibleNodeIdSet.has(HOME_NODE_ID) && isVisibleFolderId(HOME_NODE_ID, nodesById)
      ? [HOME_NODE_ID]
      : []),
    ...(index.visibleNodeIdSet.has(INBOX_NODE_ID) && isVisibleFolderId(INBOX_NODE_ID, nodesById)
      ? [INBOX_NODE_ID]
      : []),
    ...regularFolderIds,
    TRASH_NODE_ID
  ];
}

function isNativeContentNode(nodeId: string, nodesById: WorkspaceListNodesById) {
  const node = nodesById[nodeId];
  return Boolean(node && node.kind !== 'folder' && !node.anchorLink);
}

function buildDirectNativeContentCountByFolderId(
  folderNodeOrder: string[],
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  const countById = new Map<string, number>();
  for (const folderId of folderNodeOrder) {
    const count = (index.visibleChildrenByParent.get(folderId) ?? []).filter((nodeId) =>
      isNativeContentNode(nodeId, nodesById)
    ).length;
    countById.set(folderId, count);
  }
  return countById;
}

function countHomeNativeContentNodes(
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  return index.visibleNodeIds.filter((nodeId) => isNativeContentNode(nodeId, nodesById)).length;
}

function buildFolderTopicCountById(
  folderNodeOrder: string[],
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  nodeOrder: string[],
  trashedNodeIds: readonly string[]
) {
  const countById = buildDirectNativeContentCountByFolderId(folderNodeOrder, index, nodesById);
  if (folderNodeOrder.includes(HOME_NODE_ID)) {
    countById.set(HOME_NODE_ID, countHomeNativeContentNodes(index, nodesById));
  }
  const trashCount = selectTrashRootIds(nodeOrder, nodesById, trashedNodeIds).length;
  countById.set(TRASH_NODE_ID, trashCount);
  return countById;
}

export function buildWorkspaceListStructureSignature(
  nodeOrder: readonly string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const parts = [
    `order:${nodeOrder.join('\u001f')}`,
    `trash:${trashedNodeIds.join('\u001f')}`
  ];

  for (const nodeId of nodeOrder) {
    const node = nodesById[nodeId];
    parts.push([
      nodeId,
      node?.kind ?? '',
      node?.anchorLink ? 'anchored' : '',
      node?.parentNodeId ?? '',
      node?.specialKind ?? ''
    ].join('\u001e'));
  }

  return parts.join('\u001d');
}

export function buildWorkspaceDualListStructureData(
  args: WorkspaceDualListStructureArgs
): WorkspaceDualListStructureData {
  const listIndex = buildWorkspaceListChildrenIndex(args.nodeOrder, args.listNodesById, args.trashedNodeIds);
  const folderNodeOrder = buildFolderNodeOrderFromIndex(listIndex, args.listNodesById);
  return {
    folderTopicCountById: buildFolderTopicCountById(
      folderNodeOrder,
      listIndex,
      args.listNodesById,
      args.nodeOrder,
      args.trashedNodeIds
    ),
    folderNodeOrder,
    listIndex
  };
}
