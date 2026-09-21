import {
  resolveRestoreNodeCandidates,
  type RestoreNodeCandidate
} from '../../lib/core/database/nodeRestoreConflicts';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { loadCompanionWorkspaceNodes } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { applyCompanionTrashRestoreNodeVersions } from '../shared/platform/companionSyncObjects';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import {
  isCanonicalTrashedNodeId,
  selectCanonicalTrashedNodeDeletedAtById,
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds
} from '../shared/workspaceCanonicalSelectors';

import {
  toCompanionNativeNodeVersion
} from './companionAnnotationNodeVersion';

interface RestoreCompanionTrashNodeArgs {
  deviceId: string;
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot | null;
  versionId?: string;
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

async function buildRestoredNodeVersion(
  node: WorkspaceNodeSnapshot,
  deviceId: string,
  restoredAt: string,
  versionId?: string
) {
  if (!node.currentVersionId) {
    throw new Error('Trash restore requires a synced base version.');
  }
  const restoredNode: WorkspaceNodeSnapshot = {
    ...node,
    deletedAt: null,
    updatedAt: restoredAt
  };
  return {
    node: { ...restoredNode },
    version: await toCompanionNativeNodeVersion(restoredNode, deviceId, versionId)
  };
}

function toRestoreCandidate(node: WorkspaceNodeSnapshot): RestoreNodeCandidate {
  return {
    createdAt: node.createdAt,
    deletedAt: node.deletedAt ?? null,
    id: node.id,
    importContentFingerprint: node.importContentFingerprint ?? null,
    importSourceFingerprint: node.importSourceFingerprint ?? null
  };
}

export async function restoreCompanionTrashNode(args: RestoreCompanionTrashNodeArgs) {
  const snapshot = args.snapshot ? normalizeWorkspaceSnapshot(args.snapshot) : null;
  const node = snapshot?.nodesById[args.nodeId];
  if (!snapshot || !node || !isCanonicalTrashedNodeId(snapshot, args.nodeId)) {
    return null;
  }
  const restoredAt = args.now ?? new Date().toISOString();
  const subtreeIds = collectNodeSubtreeIds(args.nodeId, snapshot.nodesById)
    .filter((nodeId) => isCanonicalTrashedNodeId(snapshot, nodeId));
  const restoreResult = resolveRestoreNodeCandidates(
    subtreeIds,
    Object.values(snapshot.nodesById).map(toRestoreCandidate)
  );
  let restorableNodes = restoreResult.restoredNodeIds
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  if (isAvailableNativeCompanionRuntime()) {
    restorableNodes = await loadCompanionWorkspaceNodes(restoreResult.restoredNodeIds);
    if (restorableNodes.length !== restoreResult.restoredNodeIds.length) {
      throw new Error('Trash restore source is unavailable.');
    }
    if (restorableNodes.some((current) => (
      current.currentVersionId !== snapshot.nodesById[current.id]?.currentVersionId
    ))) {
      throw new Error('local_restore_not_applied');
    }
  }
  const restored = await Promise.all(
    restorableNodes.map((node) => buildRestoredNodeVersion(
      node, args.deviceId, restoredAt, node.id === args.nodeId ? args.versionId : undefined
    ))
  );
  await applyCompanionTrashRestoreNodeVersions(restored.map((entry) => entry.version));
  const restoredIds = new Set(restoreResult.restoredNodeIds);
  const nextNodesById = {
    ...snapshot.nodesById,
    ...Object.fromEntries(restored.map((entry) => [entry.node.id, entry.node]))
  };
  const nextNodeOrder = [
    ...snapshot.nodeOrder,
    ...restoreResult.restoredNodeIds.filter((nodeId) => !snapshot.nodeOrder.includes(nodeId))
  ];
  const targetNodeId = restoreResult.skippedConflicts[0]?.liveNodeId ?? args.nodeId;
  const nextSource = {
    ...snapshot,
    nodeOrder: nextNodeOrder,
    nodesById: nextNodesById
  };
  return {
    nodeId: targetNodeId,
    snapshot: {
      ...snapshot,
      activeNodeId: targetNodeId,
      nodeOrder: selectCanonicalVisibleNodeIds(nextSource),
      nodesById: nextNodesById,
      trashedNodeDeletedAtById: selectCanonicalTrashedNodeDeletedAtById(nextSource),
      trashedNodeIds: selectCanonicalTrashedNodeIds(nextSource).filter((nodeId) => !restoredIds.has(nodeId))
    }
  };
}
