import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { canCreateChildUnderParent } from './workspaceNodeKindRules';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
import { buildCreatedChildState } from './workspaceStoreTreeCreateChildState';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type NodeSnapshot = WorkspaceState['nodesById'][string];

export function createChildNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['createChildNode'] {
  return async (parentNodeId, content = '', kind: NodeKind = 'topic', options) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let applied = false;

    set((state) => {
      if (!state.nodesById[parentNodeId] || state.trashedNodeIds.includes(parentNodeId)) return state;
      if (!canCreateChildUnderParent(state, parentNodeId, kind)) return state;
      const nextChildState = buildCreatedChildState(
        state,
        parentNodeId,
        nodeId,
        content,
        kind,
        timestamp,
        options && 'priority' in options ? options.priority : undefined
      );
      createdNode = nextChildState.nextNode;
      nextNodeOrder = nextChildState.nextNodeOrder;
      localPatch = nextChildState.patch;
      applied = true;
      return localPatch;
    });
    if (!createdNode) return null;
    markNodeCreatePending(nodeId);
    const orderForSync = [...(nextNodeOrder ?? [])] as string[];
    const result = await onNodeCreated?.(createdNode, orderForSync, nodeId, orderForSync.indexOf(nodeId));
    if (result) {
      set((state) => createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, localPatch));
    }
    if (applied && !result && kind === 'folder' && nextNodeOrder) {
      onNodeOrderChanged?.(nextNodeOrder);
    }
    await completeNodeCreateRuntimePersist(nodeId);
    return applied ? nodeId : null;
  };
}
