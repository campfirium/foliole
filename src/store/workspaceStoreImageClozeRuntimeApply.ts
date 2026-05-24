import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceNode = WorkspaceState['nodesById'][string];
type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface RuntimeSyncHandlers {
  hasMutationRuntime: () => boolean;
  syncNodeContent: (node: WorkspaceNode) => void;
  syncNodeCreation: (
    node: WorkspaceNode,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>;
}

function mergeImageClozePatches(
  localPatch: Partial<WorkspaceState> | null,
  runtimePatch: Partial<WorkspaceState> | null
) {
  if (!localPatch || !runtimePatch) {
    return runtimePatch ?? localPatch;
  }
  return {
    ...localPatch,
    ...runtimePatch,
    nodesById: {
      ...runtimePatch.nodesById,
      ...localPatch.nodesById
    }
  };
}

export async function applyCreatedImageClozeNodes(args: {
  createdNodes: WorkspaceNode[];
  handlers: RuntimeSyncHandlers;
  localPatch: Partial<WorkspaceState> | null;
  nextNodeOrder: string[] | null;
  set: WorkspaceSet;
  updatedParentNode: WorkspaceNode | null;
}) {
  if (!args.nextNodeOrder || args.createdNodes.length === 0) {
    return [];
  }
  const shouldUseLocalFallback = !args.handlers.hasMutationRuntime();
  const acceptedIds: string[] = [];
  for (const node of args.createdNodes) {
    const result = await args.handlers.syncNodeCreation(
      node,
      args.nextNodeOrder,
      node.id,
      args.nextNodeOrder.indexOf(node.id)
    );
    if (!result && !shouldUseLocalFallback) {
      return [];
    }
    args.set((state) => {
      const runtimePatch = result ? createWorkspaceNodeMutationPatch(state, result) : null;
      const acceptedPatch = mergeImageClozePatches(args.localPatch, runtimePatch);
      if (!acceptedPatch) return state;
      return acceptedPatch;
    });
    acceptedIds.push(node.id);
  }
  if (args.updatedParentNode) {
    args.handlers.syncNodeContent(args.updatedParentNode);
  }
  return acceptedIds;
}
