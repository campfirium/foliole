import {
  HOME_NODE_ID,
  TRASH_NODE_ID,
  isHomeNode,
  isTrashNode
} from '../../features/nodes/model/specialNodes';
import { selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { deriveFolderContentCounts, isRegularNavigationFolder } from './workspaceFolderContentCounts';
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
  folderCounts: ReturnType<typeof deriveFolderContentCounts>;
  listIndex: WorkspaceListChildrenIndex;
  homeTopicNodeOrder: string[];
  topicNodeOrderByFolderId: Map<string, string[]>;
}

function buildFolderNodeOrderFromIndex(
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  const homeFolderIds = index.visibleNodeIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return isRegularNavigationFolder(node) && (nodeId === HOME_NODE_ID || isHomeNode(node));
  });
  const rootFolderIds = index.visibleNodeIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return (
      isRegularNavigationFolder(node) &&
      nodeId !== HOME_NODE_ID &&
      nodeId !== TRASH_NODE_ID &&
      !isHomeNode(node) &&
      !isTrashNode(node)
    );
  });

  return [
    ...homeFolderIds,
    ...rootFolderIds,
    TRASH_NODE_ID
  ];
}

function isTopicColumnNode(nodeId: string, nodesById: WorkspaceListNodesById) {
  const node = nodesById[nodeId];
  return Boolean(node && node.kind !== 'folder');
}

function collectHomeTopicColumnNodeIds(
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  return index.visibleNodeIds.filter((nodeId) => {
    if (!isTopicColumnNode(nodeId, nodesById)) return false;
    const parentId = nodesById[nodeId]?.parentNodeId ?? null;
    const parentNode = parentId ? nodesById[parentId] : null;
    return !parentNode || parentNode.kind === 'folder';
  });
}

function collectDirectTopicColumnNodeIds(
  folderNodeId: string,
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById
) {
  return (index.visibleChildrenByParent.get(folderNodeId) ?? []).filter((nodeId) =>
    isTopicColumnNode(nodeId, nodesById)
  );
}

function buildTopicNodeOrderByFolderId(
  folderNodeOrder: string[],
  index: WorkspaceListChildrenIndex,
  nodesById: WorkspaceListNodesById,
  homeTopicNodeOrder: string[]
) {
  const topicNodeOrderByFolderId = new Map<string, string[]>();
  for (const folderId of folderNodeOrder) {
    const folderNode = nodesById[folderId];
    topicNodeOrderByFolderId.set(
      folderId,
      folderId === HOME_NODE_ID || isHomeNode(folderNode)
        ? homeTopicNodeOrder
        : collectDirectTopicColumnNodeIds(folderId, index, nodesById)
    );
  }
  return topicNodeOrderByFolderId;
}

function readLifecycle(node: WorkspaceListNode | undefined) {
  return (node as (WorkspaceListNode & { deletedAt?: string | null }) | undefined)?.deletedAt;
}

export function hasWorkspaceListStructureChange(
  before: WorkspaceListNode | undefined,
  after: WorkspaceListNode | undefined
) {
  if (before === after) return false;
  return Boolean(before) !== Boolean(after) ||
    before?.kind !== after?.kind ||
    Boolean(before?.anchorLink) !== Boolean(after?.anchorLink) ||
    before?.parentNodeId !== after?.parentNodeId ||
    before?.specialKind !== after?.specialKind ||
    readLifecycle(before) !== readLifecycle(after);
}

export function buildWorkspaceDualListStructureData(
  args: WorkspaceDualListStructureArgs,
  previous?: { data: WorkspaceDualListStructureData; listNodesById: WorkspaceListNodesById }
): WorkspaceDualListStructureData {
  const listIndex = buildWorkspaceListChildrenIndex(
    args.nodeOrder, args.listNodesById, args.trashedNodeIds,
    previous && { index: previous.data.listIndex, nodesById: previous.listNodesById }
  );
  const folderNodeOrder = buildFolderNodeOrderFromIndex(listIndex, args.listNodesById);
  const homeTopicNodeOrder = collectHomeTopicColumnNodeIds(listIndex, args.listNodesById);
  return {
    folderCounts: deriveFolderContentCounts(
      { index: listIndex, nodesById: args.listNodesById },
      folderNodeOrder,
      selectTrashRootIds(args.nodeOrder, args.listNodesById, args.trashedNodeIds).length,
      previous && {
        source: { index: previous.data.listIndex, nodesById: previous.listNodesById },
        counts: previous.data.folderCounts
      }
    ),
    folderNodeOrder,
    listIndex,
    homeTopicNodeOrder,
    topicNodeOrderByFolderId: buildTopicNodeOrderByFolderId(
      folderNodeOrder,
      listIndex,
      args.listNodesById,
      homeTopicNodeOrder
    )
  };
}
