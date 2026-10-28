import {
  resolveRestoreNodeCandidates,
  type RestoreNodeCandidate
} from '../../lib/core/database/nodeRestoreConflicts';
import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { prepareWorkspaceNodeChildrenIndex } from '../features/nodes/model/workspaceNodeChildrenIndex';
import { runCompanionHistoryMutation } from '../shared/platform/companion/runtime/companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from '../shared/platform/companion/runtime/companionNodeHistory';
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
  const index = prepareWorkspaceNodeChildrenIndex(nodesById);
  const result: string[] = [];
  const pending = [nodeId];
  while (pending.length) {
    const currentNodeId = pending.pop()!;
    result.push(currentNodeId);
    const children = index.children.get(currentNodeId) ?? [];
    for (let cursor = children.length - 1; cursor >= 0; cursor--) {
      const child = children[cursor]!;
      // Snapshot normalization excludes aliases whose record key differs from their ID.
      if (child.key === child.id) pending.push(child.id);
    }
  }
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

async function loadRestoreSources(snapshot: WorkspaceSnapshot, nodeIds: string[]) {
  if (!isAvailableNativeCompanionRuntime()) {
    return nodeIds.map(nodeId => snapshot.nodesById[nodeId])
      .filter((node): node is WorkspaceNodeSnapshot => Boolean(node));
  }
  const nodes = await loadCompanionWorkspaceNodes(nodeIds);
  if (nodes.length !== nodeIds.length) throw new Error('Trash restore source is unavailable.');
  if (nodes.some(node => node.currentVersionId !== snapshot.nodesById[node.id]?.currentVersionId)) {
    throw new Error('local_restore_not_applied');
  }
  return nodes;
}

export async function restoreCompanionTrashNode(args: RestoreCompanionTrashNodeArgs) {
  const source = args.snapshot;
  const snapshot = source ? normalizeWorkspaceSnapshot(source) : null;
  const node = snapshot?.nodesById[args.nodeId];
  if (!source || !snapshot || !node || !isCanonicalTrashedNodeId(snapshot, args.nodeId)) {
    return null;
  }
  const restoredAt = args.now ?? new Date().toISOString();
  const subtreeIds = collectNodeSubtreeIds(args.nodeId, source.nodesById)
    .filter((nodeId) => isCanonicalTrashedNodeId(snapshot, nodeId));
  const restoreResult = resolveRestoreNodeCandidates(
    subtreeIds,
    Object.values(snapshot.nodesById).map(toRestoreCandidate)
  );
  const restorableNodes = await loadRestoreSources(snapshot, restoreResult.restoredNodeIds);
  const restored = await Promise.all(
    restorableNodes.map((node) => buildRestoredNodeVersion(
      node, args.deviceId, restoredAt, node.id === args.nodeId ? args.versionId : undefined
    ))
  );
  await persistRestoredNodes(restored, args.deviceId, subtreeIds);
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

async function persistRestoredNodes(restored: Awaited<ReturnType<typeof buildRestoredNodeVersion>>[], deviceId: string, subtreeIds: string[]) {
  if (isAvailableNativeCompanionRuntime()) await runCompanionHistoryMutation(async db => {
    const versions = await Promise.all(restored.map(async entry => {
      const patched = await createCompanionMetadataVersion(db, entry.node, deviceId, entry.version.version_id ?? undefined);
      if (patched.parent_version_id !== entry.version.parent_version_id) throw new Error('local_restore_not_applied');
      return patched;
    }));
    await commitCompanionNodeHistoryWithDb(db, versions, 'Restore', 'local_restore', subtreeIds);
  });
  else await applyCompanionTrashRestoreNodeVersions(restored.map(entry => entry.version));
}
