import { moveOrderChildren } from '../../lib/core/nodes/structureMoveOrder';
import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import type { WorkspaceMoveNodesPayload, WorkspaceMoveNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import { buildMoveRuntimePayload, moveResultMatchesRequest } from './workspaceMoveCommit';
import { confirmMoveReadingContent } from './workspaceMoveContentBarrier';
import { commitMoveTransaction } from './workspaceMoveHistoryCommit';
import {
  isSameNodeOrder,
  resolveInsertIndex,
  resolveNextParentNodeId,
  type NodeDropIntent
} from './workspaceMoveNodes';
import { refreshMoveStructure } from './workspaceMoveRefresh';
import { canMoveRootsIntoTarget } from './workspaceNodeKindRules';
import { collectOrderedSubtreeIds } from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';
import { collectMovedNodeBlock, collectMoveRootIds } from './workspaceStoreMoveHelpers';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export type MoveNodesRuntimePayload = WorkspaceMoveNodesPayload;
export type MoveNodesTransaction = {
  activeNodeIdAtRequest: string | null;
  browseRootNodeIdAtRequest: string | null;
  movedActiveTopic: boolean;
  movedNodeIds: string[];
  rootNodeIds: string[];
  before: WorkspaceState;
  targetNodeId: string | null;
  intent: NodeDropIntent;
  patch: Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>;
  runtimePayload: MoveNodesRuntimePayload;
};

function resolveMovableRootNodeIds(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const rootNodeIds = collectMoveRootIds(nodeIds, state.nodeOrder, state.nodesById).filter(
    (nodeId) => {
      const node = state.nodesById[nodeId];
      return Boolean(node && !state.trashedNodeIds.includes(nodeId) && canNodeBeMoved(node));
    }
  );
  if (rootNodeIds.length === 0) {
    return null;
  }
  if (
    intent !== 'root' &&
    (!targetNodeId ||
      !state.nodesById[targetNodeId] ||
      state.trashedNodeIds.includes(targetNodeId))
  ) {
    return null;
  }
  return rootNodeIds;
}

function buildMovedState(
  state: WorkspaceState,
  rootNodeIds: string[],
  movedNodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const nextParentNodeId = resolveNextParentNodeId(intent, targetNodeId, state.nodesById);
  const timestamp = new Date().toISOString();
  const nextNodesById = { ...state.nodesById };
  for (const rootNodeId of rootNodeIds) {
    const node = nextNodesById[rootNodeId];
    if (!node) {
      continue;
    }
    if (node.parentNodeId !== nextParentNodeId) {
      nextNodesById[rootNodeId] = { ...node, parentNodeId: nextParentNodeId, updatedAt: timestamp };
    }
  }

  const movedNodeIdSet = new Set(movedNodeIds);
  const remainingNodeOrder = state.nodeOrder.filter((nodeId) => !movedNodeIdSet.has(nodeId));
  const insertIndex = resolveInsertIndex(
    remainingNodeOrder,
    intent === 'root' ? null : targetNodeId,
    intent,
    nextNodesById
  );
  const nextNodeOrder = [
    ...remainingNodeOrder.slice(0, insertIndex),
    ...movedNodeIds,
    ...remainingNodeOrder.slice(insertIndex)
  ];
  const changedParent = rootNodeIds.some(
    (rootNodeId) => state.nodesById[rootNodeId]?.parentNodeId !== nextParentNodeId
  );

  if (!changedParent && isSameNodeOrder(state.nodeOrder, nextNodeOrder)) {
    return null;
  }
  return { nodeOrder: nextNodeOrder, nodesById: nextNodesById };
}

function createMoveNodesPatch(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  const rootNodeIds = resolveMovableRootNodeIds(state, nodeIds, targetNodeId, intent);
  if (!rootNodeIds) {
    return null;
  }
  const movedNodeIds = collectMovedNodeBlock(
    rootNodeIds,
    state.nodeOrder,
    collectOrderedSubtreeIds,
    state.nodesById
  );
  if (movedNodeIds.length === 0 ||
      !canMoveRootsIntoTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent)) {
    return null;
  }
  return buildMovedState(state, rootNodeIds, movedNodeIds, targetNodeId, intent);
}

function prepareMoveNodesTransaction(
  state: WorkspaceState,
  nodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
): MoveNodesTransaction | null {
  const rootNodeIds = resolveMovableRootNodeIds(state, nodeIds, targetNodeId, intent);
  const movePatch = createMoveNodesPatch(state, nodeIds, targetNodeId, intent);
  if (!rootNodeIds || !movePatch) return null;
  const movedBlockNodeIds = collectMovedNodeBlock(
    rootNodeIds, state.nodeOrder, collectOrderedSubtreeIds, state.nodesById
  );
  const changedParent = rootNodeIds.some((nodeId) =>
    state.nodesById[nodeId]?.parentNodeId !== movePatch.nodesById[nodeId]?.parentNodeId);
  return {
    activeNodeIdAtRequest: state.activeNodeId,
    browseRootNodeIdAtRequest: state.browseRootNodeId,
    movedActiveTopic: Boolean(
      state.activeNodeId &&
      state.nodesById[state.activeNodeId]?.kind !== 'folder' &&
      movedBlockNodeIds.includes(state.activeNodeId)
    ),
    movedNodeIds: movedBlockNodeIds,
    rootNodeIds,
    before: state,
    targetNodeId,
    intent,
    patch: movePatch,
    runtimePayload: buildMoveRuntimePayload(state, movePatch, rootNodeIds, changedParent)
  };
}

export function createMoveNodesAction(
  set: WorkspaceSet,
  onNodesMoved?: (payload: MoveNodesRuntimePayload) => Promise<WorkspaceMoveNodesResult | undefined>
): WorkspaceState['moveNodes'] {
  return async (nodeIds, targetNodeId, intent) => {
    let transaction: MoveNodesTransaction | null = null;

    set((state) => {
      transaction = prepareMoveNodesTransaction(state, nodeIds, targetNodeId, intent);
      return state;
    });

    const preparedTransaction = transaction as MoveNodesTransaction | null;
    if (!preparedTransaction) {
      return false;
    }
    if (preparedTransaction.runtimePayload.maintainSequentialReading) {
      const ready = confirmMoveReadingContent(preparedTransaction.before, preparedTransaction.patch.nodesById,
        preparedTransaction.rootNodeIds);
      if (!(typeof ready === 'boolean' ? ready : await ready)) return false;
    }
    let latest: WorkspaceState = preparedTransaction.before;
    set((state) => { latest = state; return state; });
    if (preparedTransaction.runtimePayload.parentOrders.some((order) =>
      moveOrderChildren(order.parentNodeId, latest.nodeOrder.filter((id) =>
        latest.nodesById[id]?.parentNodeId === order.parentNodeId)).join('\0') !== order.expectedChildIds.join('\0')) ||
      preparedTransaction.runtimePayload.nodes.some((node) =>
        latest.nodesById[node.nodeId]?.parentNodeId !== node.expectedParentNodeId)) return false;
    // Saving related content can change node objects without changing the intended structural operation.
    const current = prepareMoveNodesTransaction(latest, nodeIds, targetNodeId, intent);
    if (!current) return false;
    const result = await onNodesMoved?.(current.runtimePayload);
    if (!result || !moveResultMatchesRequest(current.runtimePayload, result)) {
      await refreshMoveStructure(latest, current.runtimePayload);
      return false;
    }

    let applied = false;
    set((state) => {
      const committedPatch = commitMoveTransaction(state, current, result);
      if (!committedPatch) return state;
      applied = true;
      return committedPatch;
    });
    if (!applied) await refreshMoveStructure(latest, current.runtimePayload);
    return true;
  };
}
