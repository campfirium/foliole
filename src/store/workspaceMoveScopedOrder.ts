import { resolveInsertIndex, type NodeDropIntent } from './workspaceMoveNodes';
import { collectOrderedSubtreeIds } from './workspaceNodeTreeOrder';
import type { WorkspaceState } from './workspaceStore';

function siblingIds(state: WorkspaceState, parentId: string | null) {
  return state.nodeOrder.filter((nodeId) => state.nodesById[nodeId]?.parentNodeId === parentId);
}

export function captureMoveSiblingOrder(
  state: WorkspaceState,
  rootIds: string[],
  targetParentId: string | null
) {
  const parents = new Set<string | null>([
    targetParentId,
    ...rootIds.map((nodeId) => state.nodesById[nodeId]?.parentNodeId ?? null)
  ]);
  return [...parents].map((parentId) => ({ parentId, ids: siblingIds(state, parentId) }));
}

export function moveSiblingOrderUnchanged(
  state: WorkspaceState,
  source: ReturnType<typeof captureMoveSiblingOrder>
) {
  return source.every(({ parentId, ids }) =>
    siblingIds(state, parentId).join('\0') === ids.join('\0'));
}

export function applyMoveToCurrentOrder(args: {
  state: WorkspaceState;
  rootIds: string[];
  targetNodeId: string | null;
  intent: NodeDropIntent;
  nodesById: WorkspaceState['nodesById'];
}) {
  const moved = new Set(args.rootIds.flatMap((nodeId) =>
    collectOrderedSubtreeIds(nodeId, args.state.nodeOrder, args.state.nodesById)));
  const block = args.state.nodeOrder.filter((id) => moved.has(id));
  const remaining = args.state.nodeOrder.filter((id) => !moved.has(id));
  const index = resolveInsertIndex(remaining, args.targetNodeId, args.intent, args.nodesById);
  return [...remaining.slice(0, index), ...block, ...remaining.slice(index)];
}
