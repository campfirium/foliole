import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { normalizePushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import { createNewItemReviewProfiles } from './newItemReviewSlots';
import { markNodeCreatePending } from './workspaceNodeContentVersionGuard';
import { createWorkspaceNodeMutationPatchWithLocalSideEffects } from './workspaceNodeMutationPatch';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { completeNodeCreateRuntimePersist } from './workspaceStoreContentRuntimePersist';
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

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return async (content = '', kind: NodeKind = 'topic', options) => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let applied = false;

    set((state) => {
      const parentNodeId = resolveRootCreationParentId(kind, state);
      const created = createRootNodeRecord({
        content, kind, nodeId, parentNodeId, ...resolveCreationPriority(options), state, timestamp
      });
      nextNodeOrder = parentNodeId === INBOX_NODE_ID
        ? [INBOX_NODE_ID, nodeId, ...state.nodeOrder.filter((id) => id !== INBOX_NODE_ID)]
        : [...state.nodeOrder, nodeId];
      createdNode = created.node;
      const nextNodesById = { ...state.nodesById, [nodeId]: createdNode };
      localPatch = {
        activeNodeId: nodeId,
        nodeOrder: nextNodeOrder,
        nodesById: nextNodesById,
        untitledSequenceByParent: created.untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession(
          {
            ...state,
            activeNodeId: nodeId,
            nodeOrder: nextNodeOrder,
            nodesById: nextNodesById,
            untitledSequenceByParent: created.untitledState.untitledSequenceByParent
          },
          nodeId
        )
      };
      applied = true;
      return localPatch;
    });
    if (createdNode && nextNodeOrder) {
      markNodeCreatePending(nodeId);
      const acceptedOrder = [...nextNodeOrder] as string[];
      const result = await handlers.syncNodeCreation(createdNode, acceptedOrder, nodeId, acceptedOrder.indexOf(nodeId));
      if (result) {
        set((state) => {
          const acceptedPatch = createWorkspaceNodeMutationPatchWithLocalSideEffects(state, result, localPatch);
          return {
            ...acceptedPatch,
            reviewSession: reconcileReviewSession({ ...state, ...acceptedPatch }, nodeId)
          };
        });
      }
      await completeNodeCreateRuntimePersist(nodeId);
    }
    return createdNode && applied ? nodeId : null;
  };
}
