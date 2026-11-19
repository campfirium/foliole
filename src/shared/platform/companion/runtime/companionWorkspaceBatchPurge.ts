import { releaseDeletedNodeBodiesForBatch } from '../../../../../lib/core/database/deletedNodeBodyRelease';
import { collectTextBodyBlobCandidatesWithPort } from '../../../../../lib/core/database/textBodyBlobCollection';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph';
import { applyRemoteNodeTombstone } from '../../../../../lib/core/sync/syncNodeTombstoneApply';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { collectCompanionBatchSubtree, type CompanionBatchTarget } from './companionWorkspaceBatchTrash';

export interface CompanionBatchPurgePlan {
  roots: readonly CompanionBatchTarget[];
  entries: readonly CompanionBatchTarget[];
}

export function prepareCompanionBatchPurge(
  nodes: Record<string, WorkspaceNodeSnapshot>,
  roots: readonly CompanionBatchTarget[]
): CompanionBatchPurgePlan | null {
  if (!roots.length || roots.some(({ id, version }) => nodes[id]?.currentVersionId !== version)) return null;
  const subtree = collectCompanionBatchSubtree(nodes, roots.map(target => target.id));
  if (subtree.some(node => !node.deletedAt || !node.currentVersionId || node.webPublishedAt || node.id.startsWith('special-'))) {
    return null;
  }
  return { roots, entries: subtree.map(node => ({ id: node.id, version: node.currentVersionId! })) };
}

export function purgeCompanionTrashBatch(plan: CompanionBatchPurgePlan) {
  return runCompanionHistoryMutation(async db => {
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    const current = prepareCompanionBatchPurge(snapshot?.nodesById ?? {}, plan.roots);
    const expected = new Map(plan.entries.map(({ id, version }) => [id, version]));
    if (!current || current.entries.length !== expected.size ||
      current.entries.some(({ id, version }) => expected.get(id) !== version)) {
      throw new Error('workspace_batch_selection_changed');
    }
    const moved: string[] = [];
    // Children must be deleted before their parents, even if both were selected individually.
    for (const { id, version } of [...current.entries].reverse()) {
      const record = await loadCurrentSyncNodeRecord(db, id, false);
      if (!record || record.version_id !== version || !await applyRemoteNodeTombstone(db, record, false, moved)) {
        throw new Error('workspace_batch_deletion_not_applied');
      }
    }
    if (moved.length) throw new Error('workspace_batch_unselected_children');
    const ids = current.entries.map(({ id }) => id);
    const released = await releaseDeletedNodeBodiesForBatch(db, ids);
    if (released.length) await collectTextBodyBlobCandidatesWithPort(db, released);
    return ids;
  }, nodeIds => ({ kind: 'nodes', nodeIds, structure: true }));
}
