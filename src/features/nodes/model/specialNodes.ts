import {
  HOME_NODE_ID,
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  VIRTUAL_PUBLISHED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
} from '../../../../lib/core/database/specialNodeIds';

import type { Node } from './nodeTypes';
import { normalizeInjectedRootNodeOrder } from './specialNodeOrder';

export {
  HOME_NODE_ID,
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  VIRTUAL_PUBLISHED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID
};

interface WorkspaceNodeSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}

function createInboxNode(timestamp: string): Node {
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

function createHomeNode(timestamp: string): Node {
  return {
    id: HOME_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'home',
    title: 'Home',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createVirtualRootNode(timestamp: string): Node {
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

export function isHomeNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return node?.specialKind === 'home';
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

export function isVirtualNode(
  node: Pick<Node, 'specialKind' | 'virtualFilter'> | null | undefined
): node is Pick<Node, 'specialKind' | 'virtualFilter'> & { specialKind: 'virtual' } {
  return node?.specialKind === 'virtual';
}

export function isProtectedRootNode(node: Pick<Node, 'specialKind'> | null | undefined): boolean {
  return isHomeNode(node) || isInboxNode(node) || isTrashNode(node) || isVirtualRootNode(node);
}

function resolveNodeSpecialKind(node: Node): Node['specialKind'] | undefined {
  if (node.id === HOME_NODE_ID) {
    return 'home';
  }
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
    const nodeWithoutSpecialKind = { ...node };
    delete nodeWithoutSpecialKind.specialKind;
    return nodeWithoutSpecialKind;
  }
  return {
    ...node,
    specialKind
  };
}

function createNormalizedHomeNode(
  existingHomeNode: Node | undefined,
  fallbackTimestamp: string
): Node {
  return {
    ...createHomeNode(fallbackTimestamp),
    ...existingHomeNode,
    id: HOME_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    specialKind: 'home',
    title: 'Home',
    isTitleManual: true,
    content: '',
    reveal: null,
    review: null
  };
}

function createNormalizedInboxNode(
  existingInboxNode: Node | undefined,
  fallbackTimestamp: string
): Node {
  return {
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
}

function createNormalizedVirtualRootNode(
  existingVirtualRootNode: Node | undefined,
  fallbackTimestamp: string
): Node {
  return {
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
}

function isInjectedRootNodeId(nodeId: string) {
  return nodeId === HOME_NODE_ID || nodeId === INBOX_NODE_ID || nodeId === VIRTUAL_ROOT_NODE_ID;
}

export function ensureInboxNodeInSnapshot<T extends WorkspaceNodeSnapshot>(snapshot: T): T {
  const resolvedNodesById = Object.fromEntries(
    Object.entries(snapshot.nodesById).map(([nodeId, node]) => [nodeId, withResolvedSpecialKind(node)])
  ) as Record<string, Node>;
  const existingHomeNode = resolvedNodesById[HOME_NODE_ID];
  const existingInboxNode = resolvedNodesById[INBOX_NODE_ID];
  const fallbackTimestamp = existingHomeNode?.updatedAt ?? existingInboxNode?.updatedAt ?? new Date().toISOString();
  const homeNode = createNormalizedHomeNode(existingHomeNode, fallbackTimestamp);
  const inboxNode = createNormalizedInboxNode(existingInboxNode, fallbackTimestamp);
  const existingVirtualRootNode = resolvedNodesById[VIRTUAL_ROOT_NODE_ID];
  const virtualRootNode = createNormalizedVirtualRootNode(existingVirtualRootNode, fallbackTimestamp);

  return {
    ...snapshot,
    nodeOrder: normalizeInjectedRootNodeOrder(snapshot.nodeOrder, [
      HOME_NODE_ID,
      INBOX_NODE_ID,
      VIRTUAL_ROOT_NODE_ID
    ]),
    nodesById: {
      ...resolvedNodesById,
      [HOME_NODE_ID]: homeNode,
      [INBOX_NODE_ID]: inboxNode,
      [VIRTUAL_ROOT_NODE_ID]: virtualRootNode
    },
    trashedNodeIds: snapshot.trashedNodeIds.filter((nodeId) => !isInjectedRootNodeId(nodeId))
  };
}
