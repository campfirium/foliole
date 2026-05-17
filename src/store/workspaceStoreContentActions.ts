import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { isNodeContentLocked } from '../features/nodes/model/nodeContainers';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { syncNodeContentWithAnchorsToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

export function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceState['updateNodeContent'] {
  return (nodeId, content) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let locatorUpdatedNodesForSync: WorkspaceState['nodesById'][string][] = [];
    let nodeOrderForSync: string[] = [];
    set((state) => {
      const node = state.nodesById[nodeId];
      if (
        !node ||
        !isNodeDocumentLoaded(node) ||
        isProtectedRootNode(node) ||
        isNodeContentLocked(nodeId, state.nodeOrder, state.nodesById, new Set(state.trashedNodeIds))
        ) {
        return state;
      }
      const timestamp = new Date().toISOString();
      const nextNode = {
        ...node,
        content,
        hasContent: content.trim().length > 0,
        hideTitleHeading: false,
        title: node.isTitleManual ? node.title : deriveNodeTitleFromContent(content),
        updatedAt: timestamp
      };
      const locatorSync = syncTextAnchorLocatorsForParentContent({
        nextContent: content,
        nodesById: { ...state.nodesById, [nodeId]: nextNode },
        parentNodeId: nodeId,
        previousContent: node.content,
        timestamp
      });
      nextNodeForSync = nextNode;
      locatorUpdatedNodesForSync = locatorSync.updatedNodes;
      nodeOrderForSync = state.nodeOrder;
      return { nodesById: locatorSync.nextNodesById };
    });
    if (nextNodeForSync) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
      locatorUpdatedNodesForSync.forEach(syncWorkspaceNodeDocumentCacheFromNode);
      syncNodeContentWithAnchorsToRuntime(nextNodeForSync, locatorUpdatedNodesForSync, nodeOrderForSync);
    }
  };
}
