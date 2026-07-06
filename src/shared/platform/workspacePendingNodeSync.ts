import type { NativeWorkspaceNodeSnapshot } from '../../../lib/platform/nativeStorageContract';

import type {
  WorkspaceRuntimeNodeSnapshot,
  WorkspaceRuntimeSnapshot
} from './workspaceRuntimeTypes';

const PENDING_NODE_SYNC_STORAGE_KEY = 'foliole-pending-node-sync-v1';

interface PendingNodeSyncSnapshot {
  nodesById: Record<string, WorkspaceRuntimeNodeSnapshot>;
}

type PendingNodeSyncResolvedListener = (nodeId: string) => void;

export type PendingNodeSyncReplayDecision = 'apply' | 'block' | 'resolve';

let pendingNodeSyncResolvedListener: PendingNodeSyncResolvedListener | null = null;

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function readPendingSnapshot(): PendingNodeSyncSnapshot {
  const storage = getLocalStorage();
  const raw = storage?.getItem(PENDING_NODE_SYNC_STORAGE_KEY);
  if (!raw) {
    return { nodesById: {} };
  }
  try {
    const parsed = JSON.parse(raw) as { nodesById?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { nodesById: {} };
    }
    if (
      !parsed.nodesById ||
      typeof parsed.nodesById !== 'object' ||
      Array.isArray(parsed.nodesById)
    ) {
      return { nodesById: {} };
    }
    return { nodesById: parsed.nodesById as Record<string, WorkspaceRuntimeNodeSnapshot> };
  } catch {
    return { nodesById: {} };
  }
}

function writePendingSnapshot(snapshot: PendingNodeSyncSnapshot) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  if (Object.keys(snapshot.nodesById).length === 0) {
    storage.removeItem(PENDING_NODE_SYNC_STORAGE_KEY);
    return;
  }
  storage.setItem(PENDING_NODE_SYNC_STORAGE_KEY, JSON.stringify(snapshot));
}

function resolveRuntimeDeletedAt(
  snapshot: WorkspaceRuntimeSnapshot,
  nodeId: string,
  currentNode: NativeWorkspaceNodeSnapshot | undefined
) {
  return currentNode?.deletedAt ?? snapshot.trashedNodeDeletedAtById?.[nodeId] ?? null;
}

function isRuntimeNodeTrashed(
  snapshot: WorkspaceRuntimeSnapshot,
  nodeId: string,
  currentNode: NativeWorkspaceNodeSnapshot | undefined
) {
  return Boolean(
    currentNode?.deletedAt ||
    snapshot.trashedNodeDeletedAtById?.[nodeId] ||
    snapshot.trashedNodeIds.includes(nodeId)
  );
}

export function decidePendingNodeSyncReplay(
  snapshot: WorkspaceRuntimeSnapshot,
  pendingNode: WorkspaceRuntimeNodeSnapshot
): PendingNodeSyncReplayDecision {
  const currentNode = snapshot.nodesById[pendingNode.nodeId];
  if (!currentNode) {
    return 'apply';
  }
  if (isRuntimeNodeTrashed(snapshot, pendingNode.nodeId, currentNode)) {
    const deletedAt = resolveRuntimeDeletedAt(snapshot, pendingNode.nodeId, currentNode);
    if (pendingNode.updatedAt === currentNode.updatedAt || pendingNode.updatedAt === deletedAt) {
      return 'resolve';
    }
    return 'block';
  }
  const updateCompare = pendingNode.updatedAt.localeCompare(currentNode.updatedAt);
  if (updateCompare > 0) {
    return 'apply';
  }
  return updateCompare === 0 ? 'resolve' : 'block';
}

function toPendingWorkspaceNode(
  currentNode: NativeWorkspaceNodeSnapshot | undefined,
  pendingNode: WorkspaceRuntimeNodeSnapshot
): NativeWorkspaceNodeSnapshot {
  return {
    id: pendingNode.nodeId,
    parentNodeId: pendingNode.parentNodeId,
    kind: pendingNode.kind,
    priority: pendingNode.priority ?? null,
    desiredRetention: pendingNode.desiredRetention ?? null,
    enableShortTerm: pendingNode.enableShortTerm ?? null,
    sequentialReadingEnabled: pendingNode.sequentialReadingEnabled ?? null,
    shelvedAt: pendingNode.shelvedAt ?? null,
    manualChildOrder: pendingNode.kind === 'folder' ? (pendingNode.manualChildOrder ?? null) : null,
    title: pendingNode.title,
    isTitleManual: pendingNode.isTitleManual,
    hideTitleHeading: pendingNode.hideTitleHeading === true,
    content: pendingNode.content,
    ...(currentNode?.currentVersionId !== undefined
      ? { currentVersionId: currentNode.currentVersionId }
      : {}),
    reveal: pendingNode.reveal,
    anchorLink: pendingNode.anchorLink,
    imageRegions: pendingNode.imageRegions ?? null,
    reading: pendingNode.reading ?? null,
    review: pendingNode.review ?? currentNode?.review ?? null,
    createdAt: pendingNode.createdAt,
    ...(currentNode?.deletedAt !== undefined ? { deletedAt: currentNode.deletedAt } : {}),
    updatedAt: pendingNode.updatedAt
  };
}

function hasMergeableParent(pendingNode: WorkspaceRuntimeNodeSnapshot, knownNodeIds: Set<string>) {
  return !pendingNode.parentNodeId || knownNodeIds.has(pendingNode.parentNodeId);
}

export function stagePendingNodeSync(payload: WorkspaceRuntimeNodeSnapshot) {
  const snapshot = readPendingSnapshot();
  snapshot.nodesById[payload.nodeId] = payload;
  writePendingSnapshot(snapshot);
}

export function resolvePendingNodeSync(nodeId: string, updatedAt: string) {
  const snapshot = readPendingSnapshot();
  if (snapshot.nodesById[nodeId]?.updatedAt !== updatedAt) {
    return;
  }
  delete snapshot.nodesById[nodeId];
  writePendingSnapshot(snapshot);
  pendingNodeSyncResolvedListener?.(nodeId);
}

export function setPendingNodeSyncResolvedListener(
  listener: PendingNodeSyncResolvedListener | null
) {
  pendingNodeSyncResolvedListener = listener;
}

export function hasPendingNodeSync(nodeId: string) {
  return Boolean(readPendingSnapshot().nodesById[nodeId]);
}

export function listPendingNodeSyncNodeIds() {
  return Object.keys(readPendingSnapshot().nodesById);
}

export function listPendingNodeSyncSnapshots() {
  return Object.values(readPendingSnapshot().nodesById).sort((left, right) =>
    left.updatedAt.localeCompare(right.updatedAt)
  );
}

export function mergePendingNodeSyncIntoSnapshot(
  snapshot: WorkspaceRuntimeSnapshot | null
): WorkspaceRuntimeSnapshot | null {
  if (!snapshot) {
    return null;
  }
  const pendingNodes = listPendingNodeSyncSnapshots();
  if (pendingNodes.length === 0) {
    return snapshot;
  }
  const nodesById = { ...snapshot.nodesById };
  const knownNodeIds = new Set(Object.keys(nodesById));
  let remainingNodes = pendingNodes;
  while (remainingNodes.length > 0) {
    const blockedNodes: WorkspaceRuntimeNodeSnapshot[] = [];
    let mergedCount = 0;
    for (const pendingNode of remainingNodes) {
      if (!hasMergeableParent(pendingNode, knownNodeIds)) {
        blockedNodes.push(pendingNode);
        continue;
      }
      const decision = decidePendingNodeSyncReplay({ ...snapshot, nodesById }, pendingNode);
      if (decision === 'block') {
        blockedNodes.push(pendingNode);
        continue;
      }
      if (decision === 'resolve') {
        resolvePendingNodeSync(pendingNode.nodeId, pendingNode.updatedAt);
        mergedCount += 1;
        continue;
      }
      nodesById[pendingNode.nodeId] = toPendingWorkspaceNode(
        nodesById[pendingNode.nodeId],
        pendingNode
      );
      knownNodeIds.add(pendingNode.nodeId);
      mergedCount += 1;
    }
    if (blockedNodes.length === 0 || mergedCount === 0) {
      break;
    }
    remainingNodes = blockedNodes;
  }
  return {
    ...snapshot,
    nodesById
  };
}
