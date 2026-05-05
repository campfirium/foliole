import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import type {
  NativeInvoke,
  NativeNodeSnapshotArgs,
  NativeWorkspaceSnapshot
} from '../../lib/platform/nativeContract';
import type { NativeWorkspaceNodeSnapshot } from '../../lib/platform/nativeStorageContract';

const PENDING_NODE_SYNC_STORAGE_KEY = 'foliole-pending-node-sync-v1';

interface PendingNodeSyncSnapshot {
  nodesById: Record<string, NativeNodeSnapshotArgs>;
}

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
    if (!parsed.nodesById || typeof parsed.nodesById !== 'object' || Array.isArray(parsed.nodesById)) {
      return { nodesById: {} };
    }
    return { nodesById: parsed.nodesById as Record<string, NativeNodeSnapshotArgs> };
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

function toPendingWorkspaceNode(
  currentNode: NativeWorkspaceNodeSnapshot | undefined,
  pendingNode: NativeNodeSnapshotArgs
): NativeWorkspaceNodeSnapshot {
  return {
    id: pendingNode.nodeId,
    parentNodeId: pendingNode.parentNodeId,
    priority: pendingNode.priority ?? null,
    desiredRetention: pendingNode.desiredRetention ?? null,
    title: pendingNode.title,
    isTitleManual: pendingNode.isTitleManual,
    hideTitleHeading: pendingNode.hideTitleHeading === true,
    content: pendingNode.content,
    reveal: pendingNode.reveal,
    anchorLink: pendingNode.anchorLink,
    reading: pendingNode.reading ?? null,
    review: currentNode?.review ?? null,
    createdAt: pendingNode.createdAt,
    updatedAt: pendingNode.updatedAt
  };
}

export function stagePendingNodeSync(payload: NativeNodeSnapshotArgs) {
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
}

export function hasPendingNodeSync(nodeId: string) {
  return Boolean(readPendingSnapshot().nodesById[nodeId]);
}

export function listPendingNodeSyncNodeIds() {
  return Object.keys(readPendingSnapshot().nodesById);
}

export function mergePendingNodeSyncIntoSnapshot(
  snapshot: NativeWorkspaceSnapshot | null
): NativeWorkspaceSnapshot | null {
  if (!snapshot) {
    return null;
  }
  const pendingSnapshot = readPendingSnapshot();
  const pendingNodes = Object.values(pendingSnapshot.nodesById);
  if (pendingNodes.length === 0) {
    return snapshot;
  }
  const nodesById = { ...snapshot.nodesById };
  for (const pendingNode of pendingNodes) {
    nodesById[pendingNode.nodeId] = toPendingWorkspaceNode(nodesById[pendingNode.nodeId], pendingNode);
  }
  return {
    ...snapshot,
    nodesById
  };
}

export async function replayPendingNodeSync(runtimeInvoke: NativeInvoke): Promise<void> {
  const pendingSnapshot = readPendingSnapshot();
  const pendingNodes = Object.values(pendingSnapshot.nodesById).sort((left, right) =>
    left.updatedAt.localeCompare(right.updatedAt)
  );
  for (const pendingNode of pendingNodes) {
    await runtimeInvoke(NATIVE_COMMANDS.updateNodeContent, pendingNode);
    resolvePendingNodeSync(pendingNode.nodeId, pendingNode.updatedAt);
  }
}
