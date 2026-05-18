import type { DragEvent as ReactDragEvent } from 'react';

import type { WorkspaceListNodesById } from '../model/workspaceListNode';

const DROP_INTENT_EDGE_RATIO = 0.25;

export type NodeListDropIntent = 'before' | 'after' | 'child';

export function resolveNodeListDropIntent(event: ReactDragEvent<HTMLElement>): NodeListDropIntent {
  const rowRect = event.currentTarget.getBoundingClientRect();
  const topEdge = rowRect.top + rowRect.height * DROP_INTENT_EDGE_RATIO;
  const bottomEdge = rowRect.bottom - rowRect.height * DROP_INTENT_EDGE_RATIO;
  if (event.clientY <= topEdge) {
    return 'before';
  }
  if (event.clientY >= bottomEdge) {
    return 'after';
  }
  return 'child';
}

export function canDropNodeListSourceOnRoot(sourceNodeIds: string[], nodesById: WorkspaceListNodesById) {
  return sourceNodeIds.every((nodeId) => nodesById[nodeId]?.kind === 'folder');
}
