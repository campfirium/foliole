import {
  VIRTUAL_NODE_FILTER_VERSION,
  createManualVirtualNodeFilter,
  type VirtualNodeFilter
} from '../../lib/core/nodes/virtualNodeFilter';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { VIRTUAL_ROOT_NODE_ID, isVirtualNode } from '../features/nodes/model/specialNodes';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeCreateAckPatch, didRuntimeConfirmNodeCreation } from './workspaceNodeMutationPatch';
import { insertNodeBlockUnderParent } from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { cancelNodeCreateRuntimePersist, completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
import {
  beginStructureCreateHistory,
  completeStructureCreateHistory,
  failStructureCreateHistory
} from './workspaceStructureCreateHistory';
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

function prepareVirtualNodeCreation(args: {
  mode: 'manual' | 'saved-search';
  nodeId: string;
  parentNodeId: string;
  state: WorkspaceState;
  timestamp: string;
}) {
  if (args.parentNodeId !== VIRTUAL_ROOT_NODE_ID && !isVirtualNode(args.state.nodesById[args.parentNodeId])) {
    return null;
  }
  const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(''), args.parentNodeId, args.state);
  const node = createVirtualNodeSnapshot({
    mode: args.mode,
    nodeId: args.nodeId,
    parentNodeId: args.parentNodeId,
    timestamp: args.timestamp,
    title: untitledState.title
  });
  const nodesById = { ...args.state.nodesById, [args.nodeId]: node };
  const nodeOrder = insertNodeBlockUnderParent(args.state.nodeOrder, [args.nodeId], args.parentNodeId, nodesById);
  const patch = createVirtualNodeLocalPatch({
    nodeId: args.nodeId,
    nextNodeOrder: nodeOrder,
    state: args.state,
    untitledSequenceByParent: untitledState.untitledSequenceByParent,
    updatedNodesById: nodesById
  });
  const pendingHistory = beginStructureCreateHistory({
    afterState: { ...args.state, ...patch },
    beforeState: args.state,
    history: args.state.appActionHistory,
    node
  });
  return {
    historyEntryId: pendingHistory?.entry.id ?? null,
    node,
    nodeOrder,
    patch: pendingHistory ? { ...patch, appActionHistory: pendingHistory.history } : patch
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
  get?: () => WorkspaceState;
  historyEntryId: string | null;
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
  const succeeded = didRuntimeConfirmNodeCreation(result ?? null, args.nodeId) || !hasWorkspaceNodeMutationRuntime();
  if (result && succeeded) {
    args.set((state) => createWorkspaceNodeCreateAckPatch(state, result, [args.nodeId]));
  }
  if (!hasWorkspaceNodeMutationRuntime() && args.nextNodeOrder) {
    args.onNodeOrderChanged?.(args.nextNodeOrder);
  }
  if (!succeeded) {
    cancelNodeCreateRuntimePersist(args.nodeId);
    failStructureCreateHistory({ entryId: args.historyEntryId, nodeId: args.nodeId, set: args.set });
    return null;
  }
  completeStructureCreateHistory({
    entryId: args.historyEntryId,
    ...(args.get ? { get: args.get } : {}),
    set: args.set
  });
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
  onNodeOrderChanged?: (nodeOrder: string[]) => void,
  get?: () => WorkspaceState
): WorkspaceState['createVirtualNode'] {
  return async (options) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const parentNodeId = options?.parentNodeId ?? VIRTUAL_ROOT_NODE_ID;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let applied = false;
    let historyEntryId: string | null = null;

    set((state) => {
      const prepared = prepareVirtualNodeCreation({
        mode: options?.mode ?? 'saved-search', nodeId, parentNodeId, state, timestamp
      });
      if (!prepared) return state;
      ({ historyEntryId, node: createdNode, nodeOrder: nextNodeOrder, patch: localPatch } = prepared);
      applied = true;
      return localPatch;
    });
    if (!applied) return null;
    const nodeForPersist = createdNode as NodeSnapshot | null;
    const patchForPersist = localPatch as Partial<WorkspaceState> | null;
    const orderForPersist = nextNodeOrder as string[] | null;
    return await applyCreatedVirtualNode({
      createdNode: nodeForPersist,
      ...(get ? { get } : {}),
      historyEntryId,
      localPatch: patchForPersist,
      nextNodeOrder: orderForPersist,
      nodeId,
      onNodeCreated,
      onNodeOrderChanged,
      set
    });
  };
}
