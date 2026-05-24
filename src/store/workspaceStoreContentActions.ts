import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { isNodeContentLocked } from '../features/nodes/model/nodeContainers';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

async function applyNodeContentRuntimePatch(args: {
  localPatch: Partial<WorkspaceState> | null;
  locatorUpdatedNodesForSync: WorkspaceState['nodesById'][string][];
  nextNodeForSync: WorkspaceState['nodesById'][string];
  nodeOrderForSync: string[];
  set: WorkspaceSet;
}) {
  const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
  const result = await syncNodeContentWithAnchorsMutationToRuntime(
    args.nextNodeForSync,
    args.locatorUpdatedNodesForSync,
    args.nodeOrderForSync
  );
  let applied = false;
  args.set((state) => {
    const acceptedPatch = result
      ? createWorkspaceNodeMutationPatch(state, result)
      : shouldUseLocalFallback ? args.localPatch : null;
    if (!acceptedPatch) return state;
    applied = true;
    return acceptedPatch;
  });
  if (applied) {
    syncWorkspaceNodeDocumentCacheFromNode(args.nextNodeForSync);
    args.locatorUpdatedNodesForSync.forEach(syncWorkspaceNodeDocumentCacheFromNode);
  }
  return applied;
}

export function createUpdateNodeContentAction(set: WorkspaceSet): WorkspaceState['updateNodeContent'] {
  return async (nodeId, content) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let locatorUpdatedNodesForSync: WorkspaceState['nodesById'][string][] = [];
    let nodeOrderForSync: string[] = [];
    let localPatch: Partial<WorkspaceState> | null = null;
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
      localPatch = { nodesById: locatorSync.nextNodesById };
      return state;
    });
    if (nextNodeForSync) {
      return await applyNodeContentRuntimePatch({
        localPatch,
        locatorUpdatedNodesForSync,
        nextNodeForSync,
        nodeOrderForSync,
        set
      });
    }
    return false;
  };
}
