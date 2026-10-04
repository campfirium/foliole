import { sealSyncIdentityFactProof } from '../../../../../lib/core/sync/syncIdentityFactProofSeal';
import { prepareReadySyncIdentityIndex } from '../../../../../lib/core/sync/syncIdentityIndexPreparation';
import { buildSyncIdentityNodeFactIndex } from '../../../../../lib/core/sync/syncIdentityNodeFactIndex';
import { backfillOrphanSyncTombstones } from '../../../../../lib/core/sync/syncOrphanTombstoneBackfill';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { createCompanionUuid } from '../../companionUuid';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { traceCompanionSyncStep } from './diagnostics/companionDesktopSyncTrace';

export async function createCompanionSyncGroupSourceSnapshot(payload: Record<string, unknown>) {
  const targetPath = payload.target_path;
  if (typeof targetPath !== 'string' || !targetPath.includes('/cache/foliole-provider-source-')) {
    throw new Error('sync_group_snapshot_path_invalid');
  }
  const sqlPath = targetPath.replaceAll("'", "''");
  const runId = createCompanionUuid();
  const step = <T>(stage: string, task: () => Promise<T>) =>
    traceCompanionSyncStep({ runId, stage, task });
  await step('identity_source', () => runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(async (db) => {
    await step('identity_tombstones', () => backfillOrphanSyncTombstones(db));
    if (payload.identity_index === true) {
      await step('identity_index', () => prepareReadySyncIdentityIndex(db));
    }
    await step('identity_snapshot_copy', () => db.run(`VACUUM INTO '${sqlPath}'`));
    if (payload.identity_index === true) {
      await db.run(`ATTACH DATABASE '${sqlPath}' AS identity_view`);
      try {
        await step('identity_facts', () => buildSyncIdentityNodeFactIndex(db, 'identity_view'));
        await step('identity_seal', () => sealSyncIdentityFactProof(db, 'identity_view'));
      } finally {
        await db.run('DETACH DATABASE identity_view');
      }
    }
  })));
  return { snapshot_path: targetPath };
}
