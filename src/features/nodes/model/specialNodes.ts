import type { Node } from './nodeTypes';

export const INBOX_NODE_ID = 'special-inbox';

interface WorkspaceNodeSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}

export function createInboxNode(timestamp: string): Node {
  return {
    id: INBOX_NODE_ID,
    parentNodeId: null,
    specialKind: 'inbox',
    title: 'Inbox',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function isInboxNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return node?.specialKind === 'inbox';
}

export function ensureInboxNodeInSnapshot<T extends WorkspaceNodeSnapshot>(snapshot: T): T {
  const existingInboxNode = snapshot.nodesById[INBOX_NODE_ID];
  const fallbackTimestamp = existingInboxNode?.updatedAt ?? new Date().toISOString();
  const inboxNode: Node = {
    ...createInboxNode(fallbackTimestamp),
    ...existingInboxNode,
    id: INBOX_NODE_ID,
    parentNodeId: null,
    specialKind: 'inbox',
    title: 'Inbox',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null
  };

  return {
    ...snapshot,
    nodeOrder: [INBOX_NODE_ID, ...snapshot.nodeOrder.filter((nodeId) => nodeId !== INBOX_NODE_ID)],
    nodesById: {
      ...snapshot.nodesById,
      [INBOX_NODE_ID]: inboxNode
    },
    trashedNodeIds: snapshot.trashedNodeIds.filter((nodeId) => nodeId !== INBOX_NODE_ID)
  };
}
