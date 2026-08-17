import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { Node } from '../features/nodes/model/nodeTypes';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { captureWorkspaceHistoryContext, type WorkspaceHistoryContext } from './workspaceHistoryContext';
import type { WorkspaceNavigationState } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';
import type { DeleteNodeMutationResult } from './workspaceTrashMutations';

export interface WorkspaceDeleteHistoryEntry {
  afterContext: WorkspaceHistoryContext;
  afterDeletedAtById: Record<string, string | undefined>;
  afterNavigation: WorkspaceNavigationState;
  afterNodeOrder: string[];
  afterParentNodesById: Record<string, Node>;
  beforeContext: WorkspaceHistoryContext;
  beforeDeletedAtById: Record<string, string | undefined>;
  beforeNavigation: WorkspaceNavigationState;
  beforeNodeOrder: string[];
  beforeParentNodesById: Record<string, Node>;
  id: string;
  kind: NodeKind;
  mutationTimestamp: string;
  nodeIds: string[];
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
    afterNodeOrder: [...args.afterState.nodeOrder],
    afterParentNodesById: captureParentNodes(args.afterState, args.mutation.parentNodesToSync),
    beforeContext: captureWorkspaceHistoryContext(args.beforeState),
    beforeDeletedAtById: captureDeletedAt(args.beforeState, args.mutation.nodeIds),
    beforeNavigation: cloneNavigation(args.beforeState.navigation),
    beforeNodeOrder: [...args.beforeState.nodeOrder],
    beforeParentNodesById: captureParentNodes(args.beforeState, args.mutation.parentNodesToSync),
    id: createWorkspaceActionHistoryEntryId(),
    kind: args.kind,
    mutationTimestamp: args.mutation.deletedAt,
    nodeIds: [...args.mutation.nodeIds],
    rootNodeId: args.rootNodeId,
    title: titleForKind(args.kind),
    type: 'workspace.delete'
  };
}
