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
    await db.run(`VACUUM INTO '${sqlPath}'`);
  }));
  return { snapshot_path: targetPath };
}
