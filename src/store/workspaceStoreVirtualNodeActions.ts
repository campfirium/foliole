import { VIRTUAL_NODE_FILTER_VERSION, type VirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import { insertNodeBlockUnderParent } from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type NodeSnapshot = WorkspaceState['nodesById'][string];

function createEmptyVirtualNodeFilter(): VirtualNodeFilter {
  return {
    version: VIRTUAL_NODE_FILTER_VERSION,
    match: 'all',
    conditions: []
  };
}

function createVirtualNodeSnapshot(args: {
  nodeId: string;
  timestamp: string;
  title: string;
}): NodeSnapshot {
  return {
    id: args.nodeId,
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    kind: 'folder',
    specialKind: 'virtual',
    title: args.title,
    isTitleManual: true,
    content: '',
    virtualFilter: createEmptyVirtualNodeFilter(),
    anchorLink: null,
    reveal: null,
    review: null,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
}

function createVirtualNodeLocalPatch(args: {
  nodeId: string;
  nextNodeOrder: string[];
  state: WorkspaceState;
  untitledSequenceByParent: Record<string, number>;
  updatedNodesById: WorkspaceState['nodesById'];
}) {
  return {
    activeNodeId: args.nodeId,
    nodeOrder: args.nextNodeOrder,
    nodesById: args.updatedNodesById,
    untitledSequenceByParent: args.untitledSequenceByParent,
    reviewSession: reconcileReviewSession(
      {
        ...args.state,
        activeNodeId: args.nodeId,
        nodeOrder: args.nextNodeOrder,
        nodesById: args.updatedNodesById,
        untitledSequenceByParent: args.untitledSequenceByParent
      },
      args.nodeId
    )
  };
}

async function applyCreatedVirtualNode(args: {
  createdNode: NodeSnapshot | null;
  hasMutationRuntime: () => boolean;
  localPatch: Partial<WorkspaceState> | null;
  nextNodeOrder: string[] | null;
  nodeId: string;
  onNodeCreated: ((
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>) | undefined;
  onNodeOrderChanged: ((nodeOrder: string[]) => void) | undefined;
  set: WorkspaceSet;
}) {
  if (!args.createdNode) {
    return null;
  }
  const orderForSync = [...(args.nextNodeOrder ?? [])] as string[];
  const shouldUseLocalFallback = !args.hasMutationRuntime();
  const result = await args.onNodeCreated?.(
    args.createdNode,
    orderForSync,
    args.nodeId,
    orderForSync.indexOf(args.nodeId)
  );
  let applied = false;
  args.set((state) => {
    const acceptedPatch = result
      ? createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, args.localPatch)
      : shouldUseLocalFallback ? args.localPatch : null;
    if (!acceptedPatch) return state;
    applied = true;
    return acceptedPatch;
  });
  if (applied && !result && args.nextNodeOrder) {
    args.onNodeOrderChanged?.(args.nextNodeOrder);
  }
  return applied ? args.nodeId : null;
}

export function createVirtualNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>,
  onNodeOrderChanged?: (nodeOrder: string[]) => void,
  hasMutationRuntime: () => boolean = () => false
): WorkspaceState['createVirtualNode'] {
  return async () => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;

    set((state) => {
      const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(''), VIRTUAL_ROOT_NODE_ID, state);
      const nextNode = createVirtualNodeSnapshot({ nodeId, timestamp, title: untitledState.title });
      const updatedNodesById = {
        ...state.nodesById,
        [nodeId]: nextNode
      };
      nextNodeOrder = insertNodeBlockUnderParent(state.nodeOrder, [nodeId], VIRTUAL_ROOT_NODE_ID, updatedNodesById);
      createdNode = nextNode;
      localPatch = createVirtualNodeLocalPatch({
        nextNodeOrder,
        nodeId,
        state,
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        updatedNodesById
      });
      return state;
    });
    return await applyCreatedVirtualNode({
      createdNode,
      hasMutationRuntime,
      localPatch,
      nextNodeOrder,
      nodeId,
      onNodeCreated,
      onNodeOrderChanged,
      set
    });
  };
}
