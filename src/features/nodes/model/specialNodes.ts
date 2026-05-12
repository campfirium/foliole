import type { Node } from './nodeTypes';

export const INBOX_NODE_ID = 'special-inbox';
export const TRASH_NODE_ID = 'special-trash';
export const VIRTUAL_ROOT_NODE_ID = 'special-virtual-root';
export const VIRTUAL_UNSYNCED_NODE_ID = 'special-virtual-unsynced';

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
    kind: 'folder',
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

export function createVirtualRootNode(timestamp: string): Node {
  return {
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'virtual-root',
    title: 'Virtual',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createTrashNode(timestamp: string): Node {
  return {
    id: TRASH_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'trash',
    title: 'Trash',
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

export function isVirtualRootNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return node?.specialKind === 'virtual-root';
}

export function isTrashNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return node?.specialKind === 'trash';
}

export function isVirtualNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return node?.specialKind === 'virtual';
}

export function isProtectedRootNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return isInboxNode(node) || isTrashNode(node) || isVirtualRootNode(node);
}

function resolveNodeSpecialKind(node: Node): Node['specialKind'] | undefined {
  if (node.id === INBOX_NODE_ID) {
    return 'inbox';
  }
  if (node.id === TRASH_NODE_ID) {
    return 'trash';
  }
  if (node.id === VIRTUAL_ROOT_NODE_ID) {
    return 'virtual-root';
  }
  if (node.parentNodeId === VIRTUAL_ROOT_NODE_ID) {
    return 'virtual';
  }
  return undefined;
}

function withResolvedSpecialKind(node: Node): Node {
  const specialKind = resolveNodeSpecialKind(node);
  if (!specialKind) {
    return {
      ...node,
      specialKind: undefined
    };
  }
  return {
    ...node,
    specialKind
  };
}

export function ensureInboxNodeInSnapshot<T extends WorkspaceNodeSnapshot>(snapshot: T): T {
  const resolvedNodesById = Object.fromEntries(
    Object.entries(snapshot.nodesById).map(([nodeId, node]) => [nodeId, withResolvedSpecialKind(node)])
  ) as Record<string, Node>;
  const existingInboxNode = resolvedNodesById[INBOX_NODE_ID];
  const fallbackTimestamp = existingInboxNode?.updatedAt ?? new Date().toISOString();
  const inboxNode: Node = {
    ...createInboxNode(fallbackTimestamp),
    ...existingInboxNode,
    id: INBOX_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'inbox',
    title: 'Inbox',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null
  };
  const existingVirtualRootNode = resolvedNodesById[VIRTUAL_ROOT_NODE_ID];
  const virtualRootNode: Node = {
    ...createVirtualRootNode(existingVirtualRootNode?.updatedAt ?? fallbackTimestamp),
    ...existingVirtualRootNode,
    id: VIRTUAL_ROOT_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'virtual-root',
    title: 'Virtual',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null
  };

  return {
    ...snapshot,
    nodeOrder: [
      INBOX_NODE_ID,
      VIRTUAL_ROOT_NODE_ID,
      ...snapshot.nodeOrder.filter((nodeId) => nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID)
    ],
    nodesById: {
      ...resolvedNodesById,
      [INBOX_NODE_ID]: inboxNode,
      [VIRTUAL_ROOT_NODE_ID]: virtualRootNode
    },
    trashedNodeIds: snapshot.trashedNodeIds.filter(
      (nodeId) => nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID
    )
  };
}
