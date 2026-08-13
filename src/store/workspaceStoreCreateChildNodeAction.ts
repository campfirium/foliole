import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { WorkspaceNodeMutationPatchResult } from '../shared/platform/workspaceRuntimeTypes';

import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { canCreateChildUnderParent } from './workspaceNodeKindRules';
import { createWorkspaceNodeCreateAckPatch, didRuntimeConfirmNodeCreation } from './workspaceNodeMutationPatch';
import { hasWorkspaceNodeMutationRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import {
  cancelNodeCreateRuntimePersist,
  completeNodeCreateRuntimePersist,
  drainPendingNodeContentRuntimePersists
} from './workspaceStoreContentRuntimePersist';
import { buildCreatedChildState } from './workspaceStoreTreeCreateChildState';
import {
  beginStructureCreateHistory,
  completeStructureCreateHistory,
  failStructureCreateHistory
} from './workspaceStructureCreateHistory';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type NodeSnapshot = WorkspaceState['nodesById'][string];

async function persistChildNodeCreation(args: {
  get?: () => WorkspaceState;
  historyEntryId: string | null;
  kind: NodeKind;
  node: NodeSnapshot;
  nodeId: string;
  nodeOrder: string[];
  onNodeCreated: Parameters<typeof createChildNodeAction>[1];
  onNodeOrderChanged: Parameters<typeof createChildNodeAction>[2];
  set: WorkspaceSet;
}) {
  markNodeCreatePending(args.nodeId);
  const result = await args.onNodeCreated?.(
    args.node, args.nodeOrder, args.nodeId, args.nodeOrder.indexOf(args.nodeId)
  );
  const succeeded = didRuntimeConfirmNodeCreation(result ?? null, args.nodeId) || !hasWorkspaceNodeMutationRuntime();
  if (result && succeeded) args.set((state) => createWorkspaceNodeCreateAckPatch(state, result, [args.nodeId]));
  if (!hasWorkspaceNodeMutationRuntime() && args.kind === 'folder') args.onNodeOrderChanged?.(args.nodeOrder);
  if (!succeeded) {
    cancelNodeCreateRuntimePersist(args.nodeId);
    failStructureCreateHistory({ entryId: args.historyEntryId, nodeId: args.nodeId, set: args.set });
    return false;
  }
  completeStructureCreateHistory({
    entryId: args.historyEntryId,
    ...(args.get ? { get: args.get } : {}),
    set: args.set
  });
  await completeNodeCreateRuntimePersist(args.nodeId);
  return true;
}

export function createChildNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (
    node: NodeSnapshot,
    nodeOrder?: string[],
    activeNodeId?: string | null,
    position?: number
  ) => Promise<WorkspaceNodeMutationPatchResult | null>,
  onNodeOrderChanged?: (nodeOrder: string[]) => void,
  get?: () => WorkspaceState
): WorkspaceState['createChildNode'] {
  return async (parentNodeId, content = '', kind: NodeKind = 'topic', options) => {
    await drainPendingNodeContentRuntimePersists();
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let applied = false;
    let historyEntryId: string | null = null;

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
      const pendingHistory = beginStructureCreateHistory({
        afterActiveNodeId: nodeId,
        beforeActiveNodeId: state.activeNodeId,
        history: state.appActionHistory,
        node: nextChildState.nextNode
      });
      if (pendingHistory) {
        historyEntryId = pendingHistory.entry.id;
        localPatch.appActionHistory = pendingHistory.history;
      }
      applied = true;
      return localPatch;
    });
    if (!createdNode) return null;
    const nodeForPersist = createdNode as NodeSnapshot;
    const orderForSync = [...(nextNodeOrder ?? [])] as string[];
    const succeeded = await persistChildNodeCreation({
      ...(get ? { get } : {}), historyEntryId, kind, node: nodeForPersist, nodeId, nodeOrder: orderForSync,
      onNodeCreated, onNodeOrderChanged, set
    });
    if (!succeeded) return null;
    return applied ? nodeId : null;
  };
}
