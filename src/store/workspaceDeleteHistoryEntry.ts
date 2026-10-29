import { sortManualFolderNodes } from '../../lib/core/nodes/manualFolderOrder';
import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { DeletedChildParentOrder } from '../../lib/core/nodes/restoreDeletedChildOrder';
import type { Node } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { captureWorkspaceHistoryContext, type WorkspaceHistoryContext } from './workspaceHistoryContext';
import type { WorkspaceNavigationState } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';
import { captureStructureParentOrders } from './workspaceStructureParentOrders';
import type { DeleteNodeMutationResult } from './workspaceTrashMutations';

export interface WorkspaceDeleteHistoryEntry {
  afterContext: WorkspaceHistoryContext;
  afterDeletedAtById: Record<string, string | undefined>;
  afterNavigation: WorkspaceNavigationState;
  afterParentNodesById: Record<string, Node>;
  beforeContext: WorkspaceHistoryContext;
  beforeDeletedAtById: Record<string, string | undefined>;
  beforeNavigation: WorkspaceNavigationState;
  beforeParentNodesById: Record<string, Node>;
  id: string;
  kind: NodeKind;
  mutationTimestamp: string;
  nodeIds: string[];
  parentNodeIdById: Record<string, string | null>;
  parentOrders: DeletedChildParentOrder[];
  rootNodeId: string;
  title: string;
  type: 'workspace.delete';
}

function captureDeletedAt(state: WorkspaceState, nodeIds: string[]) {
  return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, state.trashedNodeDeletedAtById[nodeId]]));
}

function captureParentNodes(state: WorkspaceState, parentNodes: Node[]) {
  return Object.fromEntries(parentNodes.flatMap(({ id }) => state.nodesById[id] ? [[id, state.nodesById[id]!]] : []));
}

function cloneNavigation(navigation: WorkspaceNavigationState) {
  return { backStack: [...navigation.backStack], forwardStack: [...navigation.forwardStack] };
}

function titleForKind(kind: NodeKind) {
  if (kind === 'folder') return 'Delete Folder';
  if (kind === 'topic') return 'Delete Topic';
  return 'Delete Item';
}

export function createWorkspaceDeleteHistoryEntry(args: {
  afterState: WorkspaceState;
  beforeState: WorkspaceState;
  kind: NodeKind;
  mutation: DeleteNodeMutationResult;
  rootNodeId: string;
}): WorkspaceDeleteHistoryEntry {
  return {
    afterContext: captureWorkspaceHistoryContext(args.afterState),
    afterDeletedAtById: captureDeletedAt(args.afterState, args.mutation.nodeIds),
    afterNavigation: cloneNavigation(args.afterState.navigation),
    afterParentNodesById: captureParentNodes(args.afterState, args.mutation.parentNodesToSync),
    beforeContext: captureWorkspaceHistoryContext(args.beforeState),
    beforeDeletedAtById: captureDeletedAt(args.beforeState, args.mutation.nodeIds),
    beforeNavigation: cloneNavigation(args.beforeState.navigation),
    beforeParentNodesById: captureParentNodes(args.beforeState, args.mutation.parentNodesToSync),
    id: createWorkspaceActionHistoryEntryId(),
    kind: args.kind,
    mutationTimestamp: args.mutation.deletedAt,
    nodeIds: [...args.mutation.nodeIds],
    parentNodeIdById: Object.fromEntries(args.mutation.nodeIds.map(id => [id, args.beforeState.nodesById[id]!.parentNodeId])),
    parentOrders: captureStructureParentOrders(args.beforeState,
      args.mutation.nodeIds.map(id => args.beforeState.nodesById[id]!.parentNodeId)).map(order => {
        const parent = order.parentNodeId ? args.beforeState.nodesById[order.parentNodeId] : null;
        return parent?.kind === 'folder' ? { ...order, manualChildIds: sortManualFolderNodes(
          order.childIds.map(id => args.beforeState.nodesById[id]!), parent.manualChildOrder).map(node => node.id) } : order;
      }),
    rootNodeId: args.rootNodeId,
    title: titleForKind(args.kind),
    type: 'workspace.delete'
  };
}
