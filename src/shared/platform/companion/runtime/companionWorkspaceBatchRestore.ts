import {
  MATCHING_IMPORT_CANDIDATES_SQL,
  resolveRestoreNodeCandidates,
  type RestoreNodeCandidate
} from '../../../../../lib/core/database/nodeRestoreConflicts';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { loadCompanionBatchTrashNodes, maintainCompanionBatchTrashReading, withStoredTrashReadings } from './companionTrashSequentialReading';
import { collectCompanionBatchSubtree, type CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { iosCompanionHostName } from './iosCompanionMutationState';

export function restoreCompanionBatchFromTrash(targets: readonly CompanionBatchTarget[]) {
  let readingNodeIds: string[] = [];
  return runCompanionHistoryMutation(async db => {
    // Restoring reads the restored subtrees and, for imports, the live nodes sharing their fingerprints.
    const loaded = await loadCompanionBatchTrashNodes(db, targets.map(target => target.id));
    // Only Sequential Reading maintenance consumes the restored topics' stored reading profiles.
    const nodes = loaded.nodeOrder ? await withStoredTrashReadings(db, loaded.nodes, collectCompanionBatchSubtree(loaded.nodes,
      targets.map(target => target.id)).map(node => node.id)) : loaded.nodes;
    const context = { ...loaded, nodes };
    if (targets.some(({ id, version }) => id.startsWith('special-') || !nodes[id]?.deletedAt ||
      nodes[id].currentVersionId !== version)) throw new Error('workspace_batch_selection_changed');
    const trashed = collectCompanionBatchSubtree(nodes, targets.map(target => target.id)).filter(node => node.deletedAt);
    const result = resolveRestoreNodeCandidates(trashed.map(node => node.id), await loadRestoreCandidates(db, trashed));
    const now = new Date().toISOString();
    const host = await iosCompanionHostName(db);
    const restored = result.restoredNodeIds.map(id => ({ ...nodes[id]!, updatedAt: now, deletedAt: null }));
    const restoredIds = new Set(result.restoredNodeIds);
    const readings = maintainCompanionBatchTrashReading(context, { ...nodes, ...Object.fromEntries(restored.map(node => [node.id, node])) },
      targets.map(target => target.id).filter(id => restoredIds.has(id)), now);
    const records = await Promise.all(restored.map(node => createCompanionMetadataVersion(db, node, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Restore from Trash', 'local_restore', null, readings);
    readingNodeIds = readings.map(change => change.nodeId);
    return result;
  }, result => ({ kind: 'nodes', nodeIds: result.restoredNodeIds, structure: true, metadata: true,
    ...(readingNodeIds.length ? { readingNodeIds } : {}) }));
}

async function loadRestoreCandidates(db: DbPort, trashed: readonly WorkspaceNodeSnapshot[]) {
  const candidates = new Map<string, RestoreNodeCandidate>(trashed.map(node => [node.id, candidate(node)]));
  for (const node of trashed) {
    if (!node.importSourceFingerprint || !node.importContentFingerprint) continue;
    for (const row of await db.query(MATCHING_IMPORT_CANDIDATES_SQL, [node.importSourceFingerprint, node.importContentFingerprint])) {
      const id = String(row.id);
      if (!candidates.has(id)) candidates.set(id, { id, createdAt: String(row.created_at),
        deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
        importSourceFingerprint: row.import_source_fingerprint as string, importContentFingerprint: row.import_content_fingerprint as string });
    }
  }
  return [...candidates.values()];
}

function candidate(node: WorkspaceNodeSnapshot): RestoreNodeCandidate {
  return { id: node.id, createdAt: node.createdAt, deletedAt: node.deletedAt ?? null,
    importSourceFingerprint: node.importSourceFingerprint ?? null, importContentFingerprint: node.importContentFingerprint ?? null };
}
