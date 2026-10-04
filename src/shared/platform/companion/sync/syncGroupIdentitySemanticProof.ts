import { compareSyncIdentityNodeFacts } from '../../../../../lib/core/sync/syncIdentityNodeFactComparison';
import { readSyncIdentityNodeFactDescriptorPage } from '../../../../../lib/core/sync/syncIdentityNodeFactPage';
import { loadSyncIdentityNodeFactDescription } from '../../../../../lib/core/sync/syncIdentityNodeFactReadAll';
import { compareSyncIdentityReviewFacts } from '../../../../../lib/core/sync/syncIdentityReviewFactComparison';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { readCompanionIdentitySemanticCandidates,
  removeCompanionIdentitySatisfiedCandidates,
  type CompanionIdentityCandidateRow } from './syncGroupIdentityCandidateStore';
import { readCompanionRemoteNodeFacts } from './syncGroupIdentityRemoteRead';
import { withCompanionSyncIdentitySnapshot } from './syncGroupIdentitySourceRead';

/** Prune only same-state fact differences both devices can prove complete. */
export async function excludeCompanionSyncIdentitySatisfiedFacts(args: {
  endpointUrl: string; remoteViewId: string; snapshotPath: string;
}) {
  let after = '';
  let removed = 0;
  for (;;) {
    const rows = await readCompanionIdentitySemanticCandidates(args.snapshotPath, after);
    const satisfied: CompanionIdentityCandidateRow[] = [];
    for (const row of rows) {
      const local = await getIosCompanionDatabaseOwner().read((port) =>
        withCompanionSyncIdentitySnapshot(port, args.snapshotPath, (db) =>
          loadSyncIdentityNodeFactDescription(row.object_id, (section, cursor) =>
            readSyncIdentityNodeFactDescriptorPage(db, { nodeId: row.object_id,
              section, after: cursor, schema: 'identity_view' }), { includeReviews: false })));
      const remote = await loadSyncIdentityNodeFactDescription(row.object_id,
        (section, cursor) => readCompanionRemoteNodeFacts(args.endpointUrl,
          args.remoteViewId, row.object_id, section, cursor), { includeReviews: false });
      let comparison: ReturnType<typeof compareSyncIdentityNodeFacts>;
      try { comparison = compareSyncIdentityNodeFacts(local, remote); }
      catch (error) {
        if (error instanceof Error && error.message.startsWith('sync_identity_fact_projection_')) {
          continue;
        }
        throw error;
      }
      const reviews = await compareSyncIdentityReviewFacts(row.object_id, local.headId,
        (section, cursor) => getIosCompanionDatabaseOwner().read((port) =>
          withCompanionSyncIdentitySnapshot(port, args.snapshotPath, (db) =>
            readSyncIdentityNodeFactDescriptorPage(db, { nodeId: row.object_id,
              section, after: cursor, schema: 'identity_view' }))),
        (section, cursor) => readCompanionRemoteNodeFacts(args.endpointUrl,
          args.remoteViewId, row.object_id, section, cursor));
      if (reviews.leftNeedsRepair || reviews.rightNeedsRepair) continue;
      if (!comparison.leftNeedsRepair && !comparison.rightNeedsRepair) satisfied.push(row);
    }
    await removeCompanionIdentitySatisfiedCandidates(args.snapshotPath, satisfied);
    removed += satisfied.length;
    if (rows.length < 128) break;
    after = rows.at(-1)!.object_id;
  }
  return removed;
}
