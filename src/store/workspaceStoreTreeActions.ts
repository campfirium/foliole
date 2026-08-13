import { canNodeBeMoved } from '../features/nodes/model/nodeMovementRules';
import type { WorkspaceMoveNodesResult } from '../shared/platform/workspaceRuntimeTypes';

import { commitMoveTransaction } from './workspaceMoveHistoryCommit';
import {
  isSameNodeOrder,
  resolveInsertIndex,
  resolveNextParentNodeId,
  type NodeDropIntent
} from './workspaceMoveNodes';
import { canMoveRootsIntoTarget } from './workspaceNodeKindRules';
import { collectOrderedSubtreeIds } from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';
import { collectMovedNodeBlock, collectMoveRootIds } from './workspaceStoreMoveHelpers';
import { applySequentialReadingMovedNodes } from './workspaceStoreTreeSequentialReading';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type NodeSnapshot = WorkspaceState['nodesById'][string];
export type MoveNodesRuntimePayload = {
  nodeOrder: string[];
  nodes: Array<{
    nodeId: string;
    parentNodeId: string | null;
    reading?: NodeSnapshot['reading'];
    sequentialReadingEnabled?: boolean | null;
    updatedAt: string;
  }>;
};
export type MoveNodesTransaction = {
  activeNodeIdAtRequest: string | null;
  browseRootNodeIdAtRequest: string | null;
  movedActiveTopic: boolean;
  movedNodeIds: string[];
  rootNodeIds: string[];
  sourceNodeOrder: string[];
  sourceNodesById: Record<string, NodeSnapshot>;
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

function canMoveToTarget(
  state: WorkspaceState,
  rootNodeIds: string[],
  movedNodeIds: string[],
  targetNodeId: string | null,
  intent: NodeDropIntent
) {
  return canMoveRootsIntoTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent);
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
    nextNodesById[rootNodeId] = { ...node, parentNodeId: nextParentNodeId, updatedAt: timestamp };
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
  if (movedNodeIds.length === 0 || !canMoveToTarget(state, rootNodeIds, movedNodeIds, targetNodeId, intent)) {
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
  const sequentialState = applySequentialReadingMovedNodes({ patch: movePatch, rootNodeIds, state });
  const syncNodeIds = [...new Set([
    ...rootNodeIds,
    ...Object.keys(sequentialState.patch.nodesById).filter(
      (nodeId) => sequentialState.patch.nodesById[nodeId] !== state.nodesById[nodeId]
    )
  ])];
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
    sourceNodeOrder: [...state.nodeOrder],
    sourceNodesById: Object.fromEntries(syncNodeIds.flatMap((nodeId) => state.nodesById[nodeId]
      ? [[nodeId, state.nodesById[nodeId]!]]
      : [])),
    patch: sequentialState.patch,
    runtimePayload: {
      nodeOrder: sequentialState.patch.nodeOrder,
      nodes: syncNodeIds
        .map((nodeId) => sequentialState.patch.nodesById[nodeId])
        .filter((node): node is NodeSnapshot => Boolean(node))
        .map((node) => ({
          nodeId: node.id,
          parentNodeId: node.parentNodeId,
          reading: node.reading ?? null,
          sequentialReadingEnabled: node.sequentialReadingEnabled ?? null,
          updatedAt: node.updatedAt
        }))
    }
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
    const result = await onNodesMoved?.(preparedTransaction.runtimePayload);
    const expectedIds = preparedTransaction.runtimePayload.nodes.map((node) => node.nodeId);
    if (!result || result.movedNodeIds.length !== expectedIds.length ||
        !result.movedNodeIds.every((nodeId) => expectedIds.includes(nodeId)) ||
        result.nodeOrder.join('\0') !== preparedTransaction.runtimePayload.nodeOrder.join('\0')) return false;

    let applied = false;
    set((state) => {
      const committedPatch = commitMoveTransaction(state, preparedTransaction);
      if (!committedPatch) return state;
      applied = true;
      return committedPatch;
    });
    return applied;
  };
}
