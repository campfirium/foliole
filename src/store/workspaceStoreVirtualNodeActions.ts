import {
  VIRTUAL_NODE_FILTER_VERSION,
  createManualVirtualNodeFilter,
  type VirtualNodeFilter
} from '../../lib/core/nodes/virtualNodeFilter';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode } from '../features/nodes/model/specialNodes';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import { insertNodeBlockUnderParent } from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
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

function createInitialVirtualNodeFilter(mode: 'manual' | 'saved-search'): VirtualNodeFilter {
  return mode === 'manual' ? createManualVirtualNodeFilter() : createEmptyVirtualNodeFilter();
}

function createVirtualNodeSnapshot(args: {
  mode: 'manual' | 'saved-search';
  nodeId: string;
  parentNodeId: string;
  timestamp: string;
  title: string;
}): NodeSnapshot {
  return {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: 'folder',
    specialKind: 'virtual',
    title: args.title,
    isTitleManual: true,
    content: '',
    virtualFilter: createInitialVirtualNodeFilter(args.mode),
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
  markNodeCreatePending(args.nodeId);
  const orderForSync = [...(args.nextNodeOrder ?? [])] as string[];
  const result = await args.onNodeCreated?.(
    args.createdNode,
    orderForSync,
    args.nodeId,
    orderForSync.indexOf(args.nodeId)
  );
  if (result) {
    args.set((state) => createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, args.localPatch));
  }
  if (!result && args.nextNodeOrder) {
    args.onNodeOrderChanged?.(args.nextNodeOrder);
  }
  await completeNodeCreateRuntimePersist(args.nodeId);
  return args.nodeId;
}

export function createVirtualNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['createVirtualNode'] {
  return async (options) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const parentNodeId = options?.parentNodeId ?? VIRTUAL_ROOT_NODE_ID;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let applied = false;

    set((state) => {
      if (parentNodeId !== VIRTUAL_ROOT_NODE_ID && !isVirtualNode(state.nodesById[parentNodeId])) {
        return state;
      }
      const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(''), parentNodeId, state);
      const nextNode = createVirtualNodeSnapshot({
        mode: options?.mode ?? 'saved-search',
        nodeId,
        parentNodeId,
        timestamp,
        title: untitledState.title
      });
      const updatedNodesById = {
        ...state.nodesById,
        [nodeId]: nextNode
      };
      nextNodeOrder = insertNodeBlockUnderParent(state.nodeOrder, [nodeId], parentNodeId, updatedNodesById);
      createdNode = nextNode;
      localPatch = createVirtualNodeLocalPatch({
        nextNodeOrder,
        nodeId,
        state,
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        updatedNodesById
      });
      applied = true;
      return localPatch;
    });
    if (!applied) return null;
    return await applyCreatedVirtualNode({
      createdNode,
      localPatch,
      nextNodeOrder,
      nodeId,
      onNodeCreated,
      onNodeOrderChanged,
      set
    });
  };
}
