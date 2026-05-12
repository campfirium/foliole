import type { DragEvent as ReactDragEvent } from 'react';

import type { WorkspaceListNodesById } from '../model/workspaceListNode';

const NODE_LIST_DRAG_MIME = 'application/x-foliole-node-list';

let activeNodeListDragSource: string[] = [];

export function resolveDragSourceNodeIds(
  nodeId: string,
  noteRowIds: string[],
  selectedNodeIds: string[]
): string[] {
  if (!selectedNodeIds.includes(nodeId)) {
    return [nodeId];
  }
  const selectedSet = new Set(selectedNodeIds);
  const scopedSelection = noteRowIds.filter((candidateId) => selectedSet.has(candidateId));
  return scopedSelection.length > 0 ? scopedSelection : [nodeId];
}

export function writeNodeListDragSource(event: ReactDragEvent<HTMLElement>, nodeIds: string[]) {
  activeNodeListDragSource = nodeIds;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(NODE_LIST_DRAG_MIME, JSON.stringify(nodeIds));
  event.dataTransfer.setData('text/plain', nodeIds[0] ?? '');
}

export function readNodeListDragSource(
  event: ReactDragEvent<HTMLElement>,
  fallbackNodeIds: string[]
) {
  if (fallbackNodeIds.length > 0) {
    return fallbackNodeIds;
  }
  if (activeNodeListDragSource.length > 0) {
    return activeNodeListDragSource;
  }
  try {
    const rawNodeIds = event.dataTransfer.getData(NODE_LIST_DRAG_MIME);
    const parsed = JSON.parse(rawNodeIds) as unknown;
    return Array.isArray(parsed) && parsed.every((nodeId) => typeof nodeId === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function clearNodeListDragSource() {
  activeNodeListDragSource = [];
}

export function isInvalidNodeListDropTarget(
  targetNodeId: string,
  sourceNodeIds: string[],
  nodesById: WorkspaceListNodesById
) {
  const sourceSet = new Set(sourceNodeIds);
  if (sourceSet.has(targetNodeId)) {
    return true;
  }
  let cursorId = nodesById[targetNodeId]?.parentNodeId ?? null;
  while (cursorId) {
    if (sourceSet.has(cursorId)) {
      return true;
    }
    cursorId = nodesById[cursorId]?.parentNodeId ?? null;
  }
  return false;
}
