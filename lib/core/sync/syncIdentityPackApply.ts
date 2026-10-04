import type { DbPort } from './dbPort.js';
import { assembleSyncIdentityStagedFacts, clearSyncIdentityStagedFacts } from './syncIdentityFactAssembly.js';
import { assembleSyncIdentityDependencyFacts, clearSyncIdentityDependencyFacts } from './syncIdentityFactDependencies.js';
import { stageSyncIdentityFactPage } from './syncIdentityFactStaging.js';
import { assertSyncIdentityPackInnerMatchesDatabase,
  type parseSyncIdentityPackContainerManifest } from './syncIdentityPackManifest.js';
import { prepareSyncIdentityPackReceipt,
  recordSyncIdentityPackReceipt } from './syncIdentityPackReceipts.js';
import { applySyncPackSurfaceInTransaction } from './syncPackNodeApplyExecutor.js';
import { enqueueSyncPackResourceArticles } from './syncPackResourceArticles.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

type VerifiedManifest = ReturnType<typeof parseSyncIdentityPackContainerManifest>;

/** The caller attaches the checksum-verified pack database as `inc`. */
export async function applySyncIdentityPackWithDbPort(port: DbPort, manifest: VerifiedManifest,
  options: { hostName: string; sourceHostName?: string;
    onSettingApplied?: (port: DbPort, record: SyncPackSyncObjectRecord) => Promise<void> }) {
  return port.transaction(async (tx) => {
    await assertSyncIdentityPackInnerMatchesDatabase(tx, manifest);
    const [local] = await tx.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`);
    const page = manifest.identity_page;
    if (page.restore_id) throw new Error('sync_identity_restore_apply_required');
    if (local?.group_id !== page.group_id ||
        local.local_device_identity_key !== page.target_peer_id) {
      throw new Error('sync_identity_pack_target_mismatch');
    }
    const receipt = { page, packId: manifest.pack_id,
      databaseSha256: manifest.database_uncompressed_sha256 };
    if ((await prepareSyncIdentityPackReceipt(tx, receipt)).duplicate) {
      return { applied: false, ...(manifest.fact_tail ? { factTail: manifest.fact_tail } : {}) } as const;
    }
    if (page.facts && page.facts.section !== 'head' && manifest.fact_tail) {
      await stageSyncIdentityFactPage(tx, page, manifest.fact_tail, manifest.fact_chunk);
      await recordSyncIdentityPackReceipt(tx, receipt);
      return { applied: true, factTail: manifest.fact_tail } as const;
    }
    await assembleSyncIdentityStagedFacts(tx, page);
    const dependencies = await assembleSyncIdentityDependencyFacts(tx, page, manifest.dependencies);
    const result = await applySyncPackSurfaceInTransaction(tx, {
      currentCursor: 0, hostName: options.hostName, incomingAlias: 'inc',
      identityOrderMerge: true,
      sourcePeerId: page.source_peer_id,
      ...(options.sourceHostName ? { sourceHostName: options.sourceHostName } : {}),
      ...(options.onSettingApplied ? { onSettingApplied: options.onSettingApplied } : {})
    }, true, null);
    await enqueueSyncPackResourceArticles(tx, { groupId: page.group_id,
      incomingAlias: 'inc', peerId: page.source_peer_id });
    await clearSyncIdentityStagedFacts(tx, page);
    await clearSyncIdentityDependencyFacts(tx, dependencies);
    await recordSyncIdentityPackReceipt(tx, receipt);
    return { applied: true, ...result } as const;
  });
}
