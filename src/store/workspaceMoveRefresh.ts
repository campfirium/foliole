import type { NativeMoveNodesArgs } from '../../lib/platform/nativeMoveContract';

import type { WorkspaceState } from './workspaceStore';

/** Explicit recovery for rejected or superseded moves; never replay the old command. */
export async function refreshMoveStructure(state: WorkspaceState, payload: NativeMoveNodesArgs, extraIds: string[] = []) {
  if (!state.libraryScope) return;
  const { refreshWorkspaceSyncProjection } = await import('./workspaceSyncProjectionRefresh');
  await refreshWorkspaceSyncProjection({ kind: 'nodes', structure: true,
    nodeIds: [...new Set([...payload.nodes.map((node) => node.nodeId), ...extraIds,
      ...payload.parentOrders.flatMap((order) => order.parentNodeId ? [order.parentNodeId] : [])])] }, state.libraryScope);
}
