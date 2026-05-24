import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { canCreateChildUnderParent } from './workspaceNodeKindRules';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';
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
  onNodeOrderChanged?: (nodeOrder: string[]) => void,
  hasMutationRuntime: () => boolean = () => false
): WorkspaceState['createChildNode'] {
  return async (parentNodeId, content = '', kind: NodeKind = 'topic') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;

    set((state) => {
      if (!state.nodesById[parentNodeId] || state.trashedNodeIds.includes(parentNodeId)) return state;
      if (!canCreateChildUnderParent(state, parentNodeId, kind)) return state;
      const nextChildState = buildCreatedChildState(state, parentNodeId, nodeId, content, kind, timestamp);
      createdNode = nextChildState.nextNode;
      nextNodeOrder = nextChildState.nextNodeOrder;
      localPatch = nextChildState.patch;
      return state;
    });
    if (!createdNode) return null;
    const orderForSync = [...(nextNodeOrder ?? [])] as string[];
    const shouldUseLocalFallback = !hasMutationRuntime();
    const result = await onNodeCreated?.(createdNode, orderForSync, nodeId, orderForSync.indexOf(nodeId));
    let applied = false;
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, localPatch)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      applied = true;
      return acceptedPatch;
    });
    if (applied && !result && kind === 'folder' && nextNodeOrder) {
      onNodeOrderChanged?.(nextNodeOrder);
    }
    return applied ? nodeId : null;
  };
}
