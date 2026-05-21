import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import {
  deriveNodeTitleFromContent
} from '../features/nodes/model/deriveNodeTitle';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
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
  syncNodeCreation: (node: WorkspaceNode) => void;
  syncNodeOrder: (nodeOrder: string[]) => void;
}

function resolveRootCreationParentId(kind: NodeKind, state: WorkspaceState) {
  if (kind === 'folder') return null;
  if (!state.nodesById[INBOX_NODE_ID]) {
    throw new Error('Workspace invariant violated: Inbox node is missing.');
  }
  return INBOX_NODE_ID;
}

function createRootNodeRecord(args: {
  content: string;
  kind: NodeKind;
  nodeId: string;
  parentNodeId: string | null;
  state: WorkspaceState;
  timestamp: string;
}) {
  const untitledState = resolveCreatedNodeTitleState(
    deriveNodeTitleFromContent(args.content),
    args.parentNodeId,
    args.state
  );
  const node: WorkspaceNode = {
    id: args.nodeId,
    parentNodeId: args.parentNodeId,
    kind: args.kind,
    title: untitledState.title,
    hasContent: args.content.trim().length > 0,
    content: args.content,
    anchorLink: null,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: args.timestamp,
    updatedAt: args.timestamp
  };
  return { node, untitledState };
}

export function createRootNodeAction(
  set: WorkspaceSet,
  handlers: RuntimeSyncHandlers
): WorkspaceState['createRootNode'] {
  return (content = '', kind: NodeKind = 'topic') => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: WorkspaceNode | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const parentNodeId = resolveRootCreationParentId(kind, state);
      const created = createRootNodeRecord({ content, kind, nodeId, parentNodeId, state, timestamp });
      nextNodeOrder = parentNodeId === INBOX_NODE_ID
        ? [INBOX_NODE_ID, nodeId, ...state.nodeOrder.filter((id) => id !== INBOX_NODE_ID)]
        : [...state.nodeOrder, nodeId];
      createdNode = created.node;
      const nextNodesById = { ...state.nodesById, [nodeId]: createdNode };
      return {
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
    });
    if (createdNode && nextNodeOrder) {
      handlers.syncNodeCreation(createdNode);
      if (kind === 'folder') {
        handlers.syncNodeOrder(nextNodeOrder);
      }
    }
    return nodeId;
  };
}
