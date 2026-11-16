import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';

import type { WorkspaceState } from './workspaceStoreTypes';

type TrashSnapshot = Pick<WorkspaceState,
  'activeNodeId' | 'nodeOrder' | 'nodesById' | 'trashedNodeIds' | 'trashedNodeDeletedAtById'>;

export function applyWorkspaceTrashLifecycle(state: TrashSnapshot, nodeIds: Iterable<string>, deletedAt: string | null) {
  const nodesById = { ...state.nodesById };
  for (const id of nodeIds) {
    const node = nodesById[id];
    if (node) nodesById[id] = { ...node, deletedAt };
  }
  return normalizeWorkspaceSnapshot({ activeNodeId: state.activeNodeId, nodeOrder: state.nodeOrder,
    nodesById, trashedNodeIds: state.trashedNodeIds, trashedNodeDeletedAtById: state.trashedNodeDeletedAtById });
}
