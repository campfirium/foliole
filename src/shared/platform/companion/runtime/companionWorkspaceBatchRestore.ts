import { resolveRestoreNodeCandidates, type RestoreNodeCandidate } from '../../../../../lib/core/database/nodeRestoreConflicts';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { commitCompanionNodeHistoryWithDb, createCompanionMetadataVersion } from './companionNodeHistory';
import { collectCompanionBatchSubtree, type CompanionBatchTarget } from './companionWorkspaceBatchTrash';
import { loadCompanionWriteNodes } from './companionWriteNodes';
import { iosCompanionHostName } from './iosCompanionMutationState';

const MATCHING_IMPORTS_SQL = `SELECT id, created_at, deleted_at, import_source_fingerprint, import_content_fingerprint
  FROM nodes WHERE import_source_fingerprint = ? AND import_content_fingerprint = ?`;

export function restoreCompanionBatchFromTrash(targets: readonly CompanionBatchTarget[]) {
  return runCompanionHistoryMutation(async db => {
    // Restoring reads the restored subtrees and, for imports, the live nodes sharing their fingerprints.
    const nodes = await loadCompanionWriteNodes(db, targets.map(target => target.id), { sequentialReading: false }) ?? {};
    if (targets.some(({ id, version }) => id.startsWith('special-') || !nodes[id]?.deletedAt ||
      nodes[id].currentVersionId !== version)) throw new Error('workspace_batch_selection_changed');
    const trashed = collectCompanionBatchSubtree(nodes, targets.map(target => target.id)).filter(node => node.deletedAt);
    const result = resolveRestoreNodeCandidates(trashed.map(node => node.id), await loadRestoreCandidates(db, trashed));
    const now = new Date().toISOString();
    const host = await iosCompanionHostName(db);
    const records = await Promise.all(result.restoredNodeIds.map(id => createCompanionMetadataVersion(db, {
      ...nodes[id]!, updatedAt: now, deletedAt: null
    }, host)));
    await commitCompanionNodeHistoryWithDb(db, records, 'Restore from Trash', 'local_restore');
    return result;
  }, result => ({ kind: 'nodes', nodeIds: result.restoredNodeIds, structure: true, metadata: true }));
}

async function loadRestoreCandidates(db: DbPort, trashed: readonly WorkspaceNodeSnapshot[]) {
  const candidates = new Map<string, RestoreNodeCandidate>(trashed.map(node => [node.id, candidate(node)]));
  for (const node of trashed) {
    if (!node.importSourceFingerprint || !node.importContentFingerprint) continue;
    for (const row of await db.query(MATCHING_IMPORTS_SQL, [node.importSourceFingerprint, node.importContentFingerprint])) {
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
