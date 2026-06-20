import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { setPendingNodeSyncResolvedListener } from './workspacePendingNodeSync';
import { toRendererBoundaryNode } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';

interface WorkspaceStoreLike {
  setState: typeof import('./workspaceStore').useWorkspaceStore.setState;
}

export function registerPendingNodeSyncRendererBoundary(workspaceStore: WorkspaceStoreLike) {
  setPendingNodeSyncResolvedListener((nodeId) => {
    if (!hasWorkspaceRuntimeRepository()) {
      return;
    }

    workspaceStore.setState((state: WorkspaceState) => {
      if (state.activeNodeId === nodeId) {
        return state;
      }
      const node = state.nodesById[nodeId];
      if (!node || (node.content === '' && node.reveal === null)) {
        return state;
      }
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: toRendererBoundaryNode(node, false)
        }
      };
    });
  });
}
