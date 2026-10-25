import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import { getTextAnchorLocators } from '../features/nodes/model/nodeTypes';
import { readCompanionHistoryReview, recordCompanionAnnotationHistory } from '../shared/platform/companion/editing/companionEditHistoryRecording';
import { retainCompanionEditHistoryBase } from '../shared/platform/companion/editing/companionEditHistoryRepository';
import { assertCompanionHighlightRead, type CompanionHighlightReadGuard } from '../shared/platform/companion/reading/companionHighlightRead';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { runCompanionOptionalHighValueMutationTask } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';
import { applyCompanionSyncNodeVersionsWithDbPort } from '../shared/platform/companionSyncNodeVersions';
import { applyCompanionLocalNodeVersions } from '../shared/platform/companionSyncObjects';
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
    ? runCompanionOptionalHighValueMutationTask(() => writeExistingHighlight(args, true), { kind: 'full' })
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
  const appliedIds = withinWriter
    ? await writeIosCompanionDatabase(db => db.transaction(async tx => {
      const review = await readCompanionHistoryReview(tx, sourceNode.id);
      if (node.deletedAt && sourceNode.parentNodeId && sourceNode.currentVersionId) await retainCompanionEditHistoryBase(
        tx, sourceNode.parentNodeId, sourceNode.id, sourceNode.currentVersionId);
      const ids = await applyCompanionSyncNodeVersionsWithDbPort(tx, [nodeVersion], 'local_mutation');
      if (ids.includes(node.id) && node.parentNodeId) await recordCompanionAnnotationHistory(tx, {
        documentId: node.parentNodeId, before: { ...sourceNode, review }, after: versionedNode
      });
      return ids;
    }))
    : await applyCompanionLocalNodeVersions([nodeVersion]);
  if (withinWriter && !appliedIds.includes(node.id)) throw new Error('companion_annotation_not_applied');
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
    update: (current, timestamp) => {
      if (current.deletedAt || (current.anchorLink?.kind !== 'highlight' &&
          !(current.kind === 'item' && current.anchorLink?.kind === 'cloze' && getTextAnchorLocators(current.anchorLink.locator).length))) {
        throw new Error('companion_annotation_unavailable');
      }
      return { ...current, deletedAt: timestamp, updatedAt: timestamp };
    }
  });
}
