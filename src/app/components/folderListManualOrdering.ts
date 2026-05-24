import { sortFolderListNodes } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';

interface FolderListOrderingProps {
  folderNodeId?: string;
  nodeOrder?: string[];
  nodes?: Node[];
  nodesById: Record<string, Node>;
  sortKey?: string;
  trashedNodeIds?: string[];
}

function getDirectChildNodes(
  folderNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId && !trashedNodeIds.includes(node.id)));
}

export function resolveFolderManualChildOrder(props: Pick<FolderListOrderingProps, 'folderNodeId' | 'nodesById'>) {
  if (!props.folderNodeId) {
    return null;
  }
  return props.nodesById[props.folderNodeId]?.manualChildOrder ??
    Object.values(props.nodesById).find((node) => node.id === props.folderNodeId)?.manualChildOrder ??
    null;
}

export function resolveListedFolderNodes(props: FolderListOrderingProps) {
  if (props.nodes) {
    return props.nodes;
  }
  if (!props.folderNodeId || !props.nodeOrder) {
    return [];
  }
  const childNodes = getDirectChildNodes(props.folderNodeId, props.nodeOrder, props.nodesById, props.trashedNodeIds ?? []);
  return props.sortKey === 'manual'
    ? sortFolderListNodes(childNodes, 'manual', 'asc', {}, resolveFolderManualChildOrder(props))
    : childNodes;
}

export function moveNodeIdBefore(ids: string[], draggedNodeId: string, targetNodeId: string) {
  if (draggedNodeId === targetNodeId) {
    return ids;
  }
  const withoutDragged = ids.filter((nodeId) => nodeId !== draggedNodeId);
  const targetIndex = withoutDragged.indexOf(targetNodeId);
  return targetIndex < 0
    ? ids
    : [...withoutDragged.slice(0, targetIndex), draggedNodeId, ...withoutDragged.slice(targetIndex)];
}
