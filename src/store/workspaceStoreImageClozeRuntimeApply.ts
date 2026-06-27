import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';

type WorkspaceNode = WorkspaceState['nodesById'][string];
type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceNode) => void;
  syncNodeCreation: (
    node: WorkspaceNode,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>;
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
  const acceptedIds: string[] = [];
  for (const node of args.createdNodes) {
    markNodeCreatePending(node.id);
    const result = await args.handlers.syncNodeCreation(
      node,
      args.nextNodeOrder,
      node.id,
      args.nextNodeOrder.indexOf(node.id)
    );
    if (result) {
      args.set((state) => createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, args.localPatch));
    }
    await completeNodeCreateRuntimePersist(node.id);
    acceptedIds.push(node.id);
  }
  if (args.updatedParentNode) {
    args.handlers.syncNodeContent(args.updatedParentNode);
  }
  return acceptedIds;
}
