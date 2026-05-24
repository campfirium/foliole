import { UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeRevealMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createUpdateNodeTitleAction(set: WorkspaceSet): WorkspaceState['updateNodeTitle'] {
  return async (nodeId, title) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node)) {
        return state;
      }
      const nextNode = {
        ...node,
        title: title.trim() || UNTITLED_NODE_TITLE,
        isTitleManual: true,
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      localPatch = {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
      return state;
    });
    if (!nextNodeForSync) return false;
    const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
    const result = await syncNodeContentMutationToRuntime(nextNodeForSync);
    let applied = false;
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatch(state, result)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      applied = true;
      return acceptedPatch;
    });
    if (applied) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
    }
    return applied;
  };
}

export function createUpdateNodeRevealAction(set: WorkspaceSet): WorkspaceState['updateNodeReveal'] {
  return async (nodeId, reveal) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node) || node.reveal === null) {
        return state;
      }
      const nextNode = {
        ...node,
        hasReveal: reveal !== null,
        reveal,
        updatedAt: new Date().toISOString()
      };
      nextNodeForSync = nextNode;
      localPatch = {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
      return state;
    });
    if (!nextNodeForSync) return false;
    const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
    const result = await syncNodeRevealMutationToRuntime(nextNodeForSync);
    let applied = false;
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatch(state, result)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      applied = true;
      return acceptedPatch;
    });
    if (applied) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
    }
    return applied;
  };
}
