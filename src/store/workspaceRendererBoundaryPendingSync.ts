import { hasWorkspaceRuntimeRepository } from '../shared/platform/workspaceRuntimeRepository';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { setPendingNodeSyncResolvedListener } from './workspacePendingNodeSync';
import { toRendererBoundaryNode } from './workspaceRendererBoundary';
import { collectRendererBoundaryKeepNodeIds } from './workspaceRendererBoundaryKeepNodeIds';
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
      if (state.activeNodeId === nodeId || collectRendererBoundaryKeepNodeIds(state, state).has(nodeId)) {
        return state;
      }
      const node = state.nodesById[nodeId];
      if (!node || (node.content === '' && node.reveal === null)) {
        return state;
      }
      syncWorkspaceNodeDocumentCacheFromNode(node);
      return {
        nodesById: {
          ...state.nodesById,
          [nodeId]: toRendererBoundaryNode(node, false)
        }
      };
    });
  });
}
