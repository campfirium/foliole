import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { normalizePushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import { createNewItemReviewProfiles } from './newItemReviewSlots';
import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeCreateAckPatch, didRuntimeConfirmNodeCreation } from './workspaceNodeMutationPatch';
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

type WorkspaceNode = WorkspaceState['nodesById'][string];
type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface RuntimeSyncHandlers {
  syncNodeContent: (node: WorkspaceNode) => void;
  syncNodeCreation: (node: WorkspaceNode, nodeOrder: string[], activeNodeId?: string | null, position?: number) => Promise<import('../shared/platform/workspaceRuntimeTypes').WorkspaceNodeMutationPatchResult | null>;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

function resolveRootCreationParentId(kind: NodeKind, state: WorkspaceState) {
  if (kind === 'folder') return null;
  if (!state.nodesById[INBOX_NODE_ID]) {
    throw new Error('Workspace invariant violated: Inbox node is missing.');
  }
  return INBOX_NODE_ID;
}

function resolveCreationPriority(options: Parameters<WorkspaceState['createRootNode']>[2]) {
  return options && 'priority' in options ? { priority: options.priority } : {};
}

function createRootNodeRecord(args: {
  content: string;
  kind: NodeKind;
  nodeId: string;
  parentNodeId: string | null;
  priority?: number | null;
  state: WorkspaceState;
  timestamp: string;
}) {
  const untitledState = resolveCreatedNodeTitleState(
    deriveNodeTitleFromContent(args.content),
    args.parentNodeId,
    args.state
  );
  const reviewProfiles = args.kind === 'item'
    ? createNewItemReviewProfiles({ batchSize: 1, nodesById: args.state.nodesById, now: args.timestamp })
    : [];
  const node: WorkspaceNode = {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: args.kind,
    ...(args.priority !== undefined
      ? { priority: args.priority === null ? null : normalizePushQueuePriority(args.priority) }
      : {}),
    title: untitledState.title,
    hasContent: args.content.trim().length > 0,
    content: args.content,
    anchorLink: null,
    hasReveal: args.kind === 'item',
    reveal: args.kind === 'item' ? '' : null,
    review: reviewProfiles[0] ?? null,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
  return { node, untitledState };
}

async function persistRootNodeCreation(args: {
  createdNode: WorkspaceNode;
  get?: () => WorkspaceState;
  handlers: RuntimeSyncHandlers;
  historyEntryId: string | null;
  nodeId: string;
  nodeOrder: string[];
  set: WorkspaceSet;
}) {
  markNodeCreatePending(args.nodeId);
  const result = await args.handlers.syncNodeCreation(
    args.createdNode, args.nodeOrder, args.nodeId, args.nodeOrder.indexOf(args.nodeId)
  );
  const succeeded = didRuntimeConfirmNodeCreation(result, args.nodeId) || !hasWorkspaceNodeMutationRuntime();
  if (result && succeeded) args.set((state) => createWorkspaceNodeCreateAckPatch(state, result, [args.nodeId]));
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

function prepareRootNodeCreation(args: {
  content: string;
  kind: NodeKind;
  nodeId: string;
  options: Parameters<WorkspaceState['createRootNode']>[2];
  state: WorkspaceState;
  timestamp: string;
}) {
  const parentNodeId = resolveRootCreationParentId(args.kind, args.state);
  const created = createRootNodeRecord({
    content: args.content, kind: args.kind, nodeId: args.nodeId, parentNodeId,
    ...resolveCreationPriority(args.options), state: args.state, timestamp: args.timestamp
  });
  const nodeOrder = parentNodeId === INBOX_NODE_ID
    ? [INBOX_NODE_ID, args.nodeId, ...args.state.nodeOrder.filter((id) => id !== INBOX_NODE_ID)]
    : [...args.state.nodeOrder, args.nodeId];
  const nodesById = { ...args.state.nodesById, [args.nodeId]: created.node };
  const patch: Partial<WorkspaceState> = {
    activeNodeId: args.nodeId,
    nodeOrder,
    nodesById,
    untitledSequenceByParent: created.untitledState.untitledSequenceByParent,
    reviewSession: reconcileReviewSession({ ...args.state, activeNodeId: args.nodeId, nodeOrder, nodesById }, args.nodeId)
  };
  const pending = beginStructureCreateHistory({
    afterActiveNodeId: args.nodeId,
    beforeActiveNodeId: args.state.activeNodeId,
    history: args.state.appActionHistory,
    node: created.node
  });
  if (pending) patch.appActionHistory = pending.history;
  return { historyEntryId: pending?.entry.id ?? null, node: created.node, nodeOrder, patch };
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers,
  get?: () => WorkspaceState
): WorkspaceState['createRootNode'] {
  return async (content = '', kind: NodeKind = 'topic', options) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;
    let historyEntryId: string | null = null;

    set((state) => {
      const prepared = prepareRootNodeCreation({ content, kind, nodeId, options, state, timestamp });
      ({ historyEntryId, node: createdNode, nodeOrder: nextNodeOrder } = prepared);
      return prepared.patch;
    });
    if (createdNode && nextNodeOrder) {
      const nodeForPersist = createdNode as WorkspaceNode;
      const orderForPersist = [...nextNodeOrder] as string[];
      const succeeded = await persistRootNodeCreation({
        createdNode: nodeForPersist,
        ...(get ? { get } : {}),
        handlers,
        historyEntryId,
        nodeId,
        nodeOrder: orderForPersist,
        set
      });
      if (!succeeded) return null;
    }
    return createdNode ? nodeId : null;
  };
}
