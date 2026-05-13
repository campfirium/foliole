import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncObjects';

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
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !node || !args.snapshot.trashedNodeIds.includes(args.nodeId)) {
    return null;
  }
  const restoredAt = new Date().toISOString();
  const subtreeIds = collectNodeSubtreeIds(args.nodeId, args.snapshot.nodesById)
    .filter((nodeId) => args.snapshot?.trashedNodeIds.includes(nodeId));
  const restorableNodes = subtreeIds
    .map((nodeId) => args.snapshot?.nodesById[nodeId])
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const restored = await Promise.all(
    restorableNodes.map((node) => buildRestoredNodeVersion(node, args.deviceId, restoredAt))
  );
  await applyCompanionSyncNodeVersions(restored.map((entry) => entry.version));
  const restoredIds = new Set(subtreeIds);
  return {
    nodeId: args.nodeId,
    snapshot: {
      ...args.snapshot,
      activeNodeId: args.snapshot.activeNodeId ?? args.nodeId,
      nodesById: {
        ...args.snapshot.nodesById,
        ...Object.fromEntries(restored.map((entry) => [entry.node.id, entry.node]))
      },
      trashedNodeIds: args.snapshot.trashedNodeIds.filter((nodeId) => !restoredIds.has(nodeId))
    }
  };
}
