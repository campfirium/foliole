import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { assertCompanionHighlightRead, type CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { runCompanionOptionalHighValueMutationTask } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { applyCompanionLocalNodeVersions, applyCompanionSyncNodeVersionsWithinWriterTask } from '../shared/platform/companionSyncObjects';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

import { toCompanionNativeNodeVersion } from './companionAnnotationNodeVersion';
import { appendCompanionExistingHighlightNote } from './companionExistingHighlightActions';

interface ExistingHighlightMutation {
  deviceId: string;
  node: WorkspaceNodeSnapshot;
  guard?: CompanionHighlightReadGuard;
  snapshot: WorkspaceSnapshot;
  update: (node: WorkspaceNodeSnapshot, timestamp: string) => WorkspaceNodeSnapshot;
}

function persistExistingHighlightNode(args: ExistingHighlightMutation) {
  return isAvailableNativeCompanionRuntime()
    ? runCompanionOptionalHighValueMutationTask(() => writeExistingHighlight(args, true))
    : writeExistingHighlight(args, false);
}

async function writeExistingHighlight(args: ExistingHighlightMutation, withinWriter: boolean) {
  assertCompanionHighlightRead(args.node, args.guard);
  const sourceNode = await hydrateNativeNodeContent(args.node);
  assertCompanionHighlightRead(sourceNode, args.guard);
  const node = args.update(sourceNode, new Date().toISOString());
  const nodeVersion = await toCompanionNativeNodeVersion(node, args.deviceId);
  const versionedNode = { ...node, currentVersionId: nodeVersion.version_id };
  assertCompanionHighlightRead(sourceNode, args.guard);
  if (withinWriter) await applyCompanionSyncNodeVersionsWithinWriterTask([nodeVersion], undefined, 'local_mutation');
  else await applyCompanionLocalNodeVersions([nodeVersion]);
  return {
    nodeId: versionedNode.id,
    snapshot: {
      ...args.snapshot,
      trashedNodeIds: versionedNode.deletedAt
        ? [...new Set([...args.snapshot.trashedNodeIds, versionedNode.id])]
        : args.snapshot.trashedNodeIds,
      nodesById: { ...args.snapshot.nodesById, [versionedNode.id]: versionedNode }
    }
  };
}

async function hydrateNativeNodeContent(node: WorkspaceNodeSnapshot) {
  if (!isAvailableNativeCompanionRuntime()) return node;
  const current = await loadCompanionWorkspaceNode(node.id);
  if (!current) throw new Error('companion_highlight_node_unavailable');
  if (current.currentVersionId !== node.currentVersionId) {
    throw new Error('companion_highlight_node_changed');
  }
  return current;
}

export async function addNoteToCompanionExistingHighlight(args: {
  deviceId: string;
  nodeId: string;
  guard?: CompanionHighlightReadGuard;
  note: string;
  originalText: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !node || args.snapshot.trashedNodeIds.includes(args.nodeId)) return null;
  return persistExistingHighlightNode({
    deviceId: args.deviceId,
    node,
    ...(args.guard ? { guard: args.guard } : {}),
    snapshot: args.snapshot,
    update: (current, timestamp) => ({
      ...current,
      content: appendCompanionExistingHighlightNote({ node: current, note: args.note, originalText: args.originalText }),
      updatedAt: timestamp
    })
  });
}

export async function deleteCompanionExistingHighlight(args: {
  deviceId: string;
  nodeId: string;
  guard?: CompanionHighlightReadGuard;
  snapshot: WorkspaceSnapshot | null;
}) {
  const node = args.snapshot?.nodesById[args.nodeId];
  if (!args.snapshot || !node || args.snapshot.trashedNodeIds.includes(args.nodeId)) return null;
  return persistExistingHighlightNode({
    deviceId: args.deviceId,
    node,
    ...(args.guard ? { guard: args.guard } : {}),
    snapshot: args.snapshot,
    update: (current, timestamp) => ({
      ...current,
      deletedAt: timestamp,
      updatedAt: timestamp
    })
  });
}
