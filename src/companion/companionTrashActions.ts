import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncObjects';
import {
  selectCanonicalTrashedNodeDeletedAtById,
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds
} from '../shared/workspaceCanonicalSelectors';

import {
  canonicalCompanionNodePayload,
  sha256Hex,
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

interface RestoreCompanionTrashNodeArgs {
  deviceId: string;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}

function collectNodeSubtreeIds(nodeId: string, nodesById: Record<string, WorkspaceNodeSnapshot>) {
  const result: string[] = [];
  const visit = (currentNodeId: string) => {
    result.push(currentNodeId);
    for (const child of Object.values(nodesById)) {
      if (child.parentNodeId === currentNodeId) {
        visit(child.id);
      }
    }
  };
  visit(nodeId);
  return result;
}

async function buildRestoredNodeVersion(node: WorkspaceNodeSnapshot, deviceId: string, restoredAt: string) {
  if (!node.currentVersionId) {
    throw new Error('Trash restore requires a synced base version.');
  }
  const restoredNode: WorkspaceNodeSnapshot = {
    ...node,
    deletedAt: null,
    updatedAt: restoredAt
  };
  const contentHash = await sha256Hex(JSON.stringify(canonicalCompanionNodePayload(restoredNode)));
  return {
    node: { ...restoredNode },
    version: toCompanionNativeNodeVersion(restoredNode, deviceId, contentHash)
  };
}

export async function restoreCompanionTrashNode(args: RestoreCompanionTrashNodeArgs) {
  const snapshot = args.snapshot ? normalizeWorkspaceSnapshot(args.snapshot) : null;
  const node = snapshot?.nodesById[args.nodeId];
  if (!snapshot || !node || !snapshot.trashedNodeIds.includes(args.nodeId)) {
    return null;
  }
  const restoredAt = new Date().toISOString();
  const subtreeIds = collectNodeSubtreeIds(args.nodeId, snapshot.nodesById)
    .filter((nodeId) => snapshot.trashedNodeIds.includes(nodeId));
  const restorableNodes = subtreeIds
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const restored = await Promise.all(
    restorableNodes.map((node) => buildRestoredNodeVersion(node, args.deviceId, restoredAt))
  );
  await applyCompanionSyncNodeVersions(restored.map((entry) => entry.version));
  const restoredIds = new Set(subtreeIds);
  const nextNodesById = {
    ...snapshot.nodesById,
    ...Object.fromEntries(restored.map((entry) => [entry.node.id, entry.node]))
  };
  const nextNodeOrder = [...snapshot.nodeOrder, ...subtreeIds.filter((nodeId) => !snapshot.nodeOrder.includes(nodeId))];
  const nextSource = {
    ...snapshot,
    nodeOrder: nextNodeOrder,
    nodesById: nextNodesById
  };
  return {
    nodeId: args.nodeId,
    snapshot: {
      ...snapshot,
      activeNodeId: snapshot.activeNodeId ?? args.nodeId,
      nodeOrder: selectCanonicalVisibleNodeIds(nextSource),
      nodesById: nextNodesById,
      trashedNodeDeletedAtById: selectCanonicalTrashedNodeDeletedAtById(nextSource),
      trashedNodeIds: selectCanonicalTrashedNodeIds(nextSource).filter((nodeId) => !restoredIds.has(nodeId))
    }
  };
}
