import { VIRTUAL_NODE_FILTER_VERSION, type VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function buildVirtualNodeFilter(value: string): VirtualNodeFilter {
  const trimmedValue = value.trim();
  return {
    version: VIRTUAL_NODE_FILTER_VERSION,
    match: 'all',
    conditions: trimmedValue
      ? [{ field: 'text', operator: 'contains', value: trimmedValue }]
      : []
  };
}

export function createUpdateVirtualNodeFilterAction(set: WorkspaceSet): WorkspaceState['updateVirtualNodeFilter'] {
  return (nodeId, value) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || node.specialKind !== 'virtual') {
        return state;
      }
      const nextNode = {
        ...node,
        virtualFilter: buildVirtualNodeFilter(value),
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
    });
    if (nextNodeForSync) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      syncNodeContentToRuntime(nextNodeForSync);
    }
  };
}
