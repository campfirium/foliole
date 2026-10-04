import { sealSyncIdentityFactProof } from '../../../../../lib/core/sync/syncIdentityFactProofSeal';
import { prepareReadySyncIdentityIndex } from '../../../../../lib/core/sync/syncIdentityIndexPreparation';
import { buildSyncIdentityNodeFactIndex } from '../../../../../lib/core/sync/syncIdentityNodeFactIndex';
import { backfillOrphanSyncTombstones } from '../../../../../lib/core/sync/syncOrphanTombstoneBackfill';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

export async function createCompanionSyncGroupSourceSnapshot(payload: Record<string, unknown>) {
  const targetPath = payload.target_path;
  if (typeof targetPath !== 'string' || !targetPath.includes('/cache/foliole-provider-source-')) {
    throw new Error('sync_group_snapshot_path_invalid');
  }
  const sqlPath = targetPath.replaceAll("'", "''");
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(async (db) => {
    await backfillOrphanSyncTombstones(db);
    if (payload.identity_index === true) await prepareReadySyncIdentityIndex(db);
    await db.run(`VACUUM INTO '${sqlPath}'`);
    if (payload.identity_index === true) {
      await db.run(`ATTACH DATABASE '${sqlPath}' AS identity_view`);
      try {
        await buildSyncIdentityNodeFactIndex(db, 'identity_view');
        await sealSyncIdentityFactProof(db, 'identity_view');
      } finally {
        await db.run('DETACH DATABASE identity_view');
      }
    }
  }));
  return { snapshot_path: targetPath };
}
