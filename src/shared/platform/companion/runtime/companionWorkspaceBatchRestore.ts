import { resolveRestoreNodeCandidates } from '../../../../../lib/core/database/nodeRestoreConflicts';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { collectCompanionBatchSubtree, type CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function restoreCompanionBatchFromTrash(targets: readonly CompanionBatchTarget[]) {
  return runCompanionHistoryMutation(async db => {
    const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
    const nodes = snapshot?.nodesById ?? {};
    if (targets.some(({ id, version }) => id.startsWith('special-') || !nodes[id]?.deletedAt ||
      nodes[id].currentVersionId !== version)) throw new Error('workspace_batch_selection_changed');
    const trashed = collectCompanionBatchSubtree(nodes, targets.map(target => target.id)).filter(node => node.deletedAt);
    const result = resolveRestoreNodeCandidates(trashed.map(node => node.id), Object.values(nodes).map(node => ({
      id: node.id, createdAt: node.createdAt, deletedAt: node.deletedAt ?? null,
      importSourceFingerprint: node.importSourceFingerprint ?? null,
      importContentFingerprint: node.importContentFingerprint ?? null
    })));
    const now = new Date().toISOString();
    const host = await iosCompanionHostName(db);
    const records = await Promise.all(result.restoredNodeIds.map(id => createCompanionMetadataVersion(db, {
      ...nodes[id]!, updatedAt: now, deletedAt: null
    }, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Restore from Trash', 'local_restore');
    return result;
  }, result => ({ kind: 'nodes', nodeIds: result.restoredNodeIds, structure: true }));
}
