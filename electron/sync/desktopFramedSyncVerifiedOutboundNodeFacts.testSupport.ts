import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import { computeNodeSyncHash } from '../../lib/core/database/nodeSyncHash.js';
import { nodeSyncSnapshotHashMetadata } from '../../lib/core/database/nodeSyncSnapshotMetadata.js';
import { projectFramedSyncNodeIdentityFact, projectFramedSyncNodeRecord } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { upsertRemoteVersion } from '../../lib/core/sync/syncNodeApplyAcceptedRemote.js';
import { loadRetainedSyncNodeVersionRecords } from '../../lib/core/sync/syncNodeGraph.js';
import { applyRemoteNodeTombstone } from '../../lib/core/sync/syncNodeTombstoneApply.js';
import { isNodeVersionIdentityOnly, orderNodeVersionHistory } from '../../lib/core/sync/syncNodeVersionHistory.js';
import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

export const timestamp = '2026-10-07T00:00:00.000Z';
export type Host = ReturnType<typeof textDevice>;

export async function tombstone(host: Host, body: string, mode: 'matching' | 'standalone' | 'mismatch') {
  const record = textBranch('deleted', body, undefined, timestamp);
  record.is_tombstone = true;
  record.snapshot.deleted_at = timestamp;
  record.content_hash = computeNodeSyncHash({ ...nodeSyncSnapshotHashMetadata(record.snapshot), content: body });
  if (mode !== 'standalone') await upsertRemoteVersion(host.db, record);
  await applyRemoteNodeTombstone(host.db, record, false);
  if (mode === 'mismatch') host.sqlite.prepare("UPDATE node_sync_versions SET host_name = 'different' WHERE version_id = 'deleted'").run();
  return record;
}

export async function oldProjections(host: Host, ids: string[]) {
  const records = await loadRetainedSyncNodeVersionRecords(host.db, ids);
  return orderNodeVersionHistory(ids.map((id) => records.get(id)!)).map((record) => {
    if (isNodeVersionIdentityOnly(record)) {
      const fact = projectFramedSyncNodeIdentityFact(record);
      return { manifest: { facts: [fact], blobs: fact.blobs } };
    }
    return { manifest: projectFramedSyncNodeRecord(record).manifest };
  });
}

export async function migrate(host: Host) {
  await host.db.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
    await tx.run('DROP TABLE content_blob_data');
  });
}
