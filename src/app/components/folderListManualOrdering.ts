import { sortFolderListNodes } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, isHomeNode } from '../../features/nodes/model/specialNodes';
import { isCanonicalVisibleNodeId } from '../../shared/workspaceCanonicalSelectors';

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

function isHomeFolderNode(folderNodeId: string, nodesById: Record<string, Node>) {
  return folderNodeId === HOME_NODE_ID || isHomeNode(nodesById[folderNodeId]);
}

function isHomeListContentNode(
  nodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: readonly string[]
) {
  const node = nodesById[nodeId];
  const parentNode = node?.parentNodeId ? nodesById[node.parentNodeId] : null;
  return Boolean(
    node &&
      node.kind === 'topic' &&
      !node.anchorLink &&
      parentNode?.kind !== 'topic' &&
      parentNode?.kind !== 'item' &&
      isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, nodeId)
  );
}

function getHomeContentNodes(
  nodeOrder: string[],
  nodesById: Record<string, Node>,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder
    .filter((nodeId) => isHomeListContentNode(nodeId, nodeOrder, nodesById, trashedNodeIds))
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node));
}

export function resolveFolderManualChildOrder(props: Pick<FolderListOrderingProps, 'folderNodeId' | 'nodesById'>) {
  if (!props.folderNodeId || isHomeFolderNode(props.folderNodeId, props.nodesById)) {
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
  if (isHomeFolderNode(props.folderNodeId, props.nodesById)) {
    return getHomeContentNodes(props.nodeOrder, props.nodesById, props.trashedNodeIds ?? []);
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
