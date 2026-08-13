import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { removeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import {
  createWorkspaceNodeCreateAckPatch,
  didRuntimeConfirmNodeCreation
} from './workspaceNodeMutationPatch';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  cancelNodeCreateRuntimePersist,
  completeNodeCreateRuntimePersist
} from './workspaceStoreContentRuntimePersist';

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
  get?: () => WorkspaceState;
  handlers: RuntimeSyncHandlers;
  nextNodeOrder: string[] | null;
  parentNodeId: string;
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
    const runtimeConfirmed = didRuntimeConfirmNodeCreation(result, node.id);
    if (runtimeConfirmed && result) {
      args.set((state) => createWorkspaceNodeCreateAckPatch(state, result, [node.id]));
    }
    const succeeded = runtimeConfirmed || !hasWorkspaceNodeMutationRuntime();
    if (succeeded) {
      await completeNodeCreateRuntimePersist(node.id);
      acceptedIds.push(node.id);
    } else {
      cancelNodeCreateRuntimePersist(node.id);
      removeCachedWorkspaceNodeDocument(node.id);
    }
  }
  const succeeded = acceptedIds.length === args.createdNodes.length;
  args.get?.().settleEditorAnnotationCreation({
    annotationNodeIds: args.createdNodes.map(({ id }) => id),
    nodeId: args.parentNodeId,
    succeeded
  });
  if (succeeded && args.updatedParentNode) {
    args.handlers.syncNodeContent(args.updatedParentNode);
  }
  return acceptedIds;
}
