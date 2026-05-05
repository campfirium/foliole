import type { Node } from '../../features/nodes/model/nodeTypes';

import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function getReadableNodeIds(nodeOrder: string[], nodesById: Record<string, Node>, trashedNodeIds: string[]) {
  return nodeOrder.filter((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return false;
    }
    const node = nodesById[nodeId];
    return Boolean(node && node.kind !== 'folder');
  });
}

export function openNextReadableNode(props: WorkspaceLayoutProps, readableNodeIds: string[]) {
  const currentIndex = props.activeNodeId ? readableNodeIds.indexOf(props.activeNodeId) : -1;
  const nextNodeId = currentIndex >= 0 ? readableNodeIds[currentIndex + 1] : undefined;
  if (nextNodeId) {
    props.onSelectNode(nextNodeId);
  }
}

export function openPreviousReadableNode(props: WorkspaceLayoutProps, readableNodeIds: string[]) {
  const currentIndex = props.activeNodeId ? readableNodeIds.indexOf(props.activeNodeId) : -1;
  const previousNodeId = currentIndex > 0 ? readableNodeIds[currentIndex - 1] : undefined;
  if (previousNodeId) {
    props.onSelectNode(previousNodeId);
  }
}

export function openAdjacentReadableNode(
  props: WorkspaceLayoutProps,
  readableNodeIds: string[],
  direction: 'backward' | 'forward'
) {
  if (direction === 'forward') {
    openNextReadableNode(props, readableNodeIds);
    return;
  }
  openPreviousReadableNode(props, readableNodeIds);
}
