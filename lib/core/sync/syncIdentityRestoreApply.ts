import type { DbPort } from './dbPort.js';
import { loadLatestSyncGroupRestoreEvent,
  markSyncGroupRestoreApplied } from './syncGroupRestoreEvents.js';
import { clearWorkgroupSyncDataForRestore } from './syncGroupRestoreReset.js';
import { createSyncIdentityDigest } from './syncIdentityDigest.js';
import { assembleSyncIdentityStagedFacts, clearSyncIdentityStagedFacts } from './syncIdentityFactAssembly.js';
import { assembleSyncIdentityDependencyFacts, clearSyncIdentityDependencyFacts } from './syncIdentityFactDependencies.js';
import { stageSyncIdentityFactPage } from './syncIdentityFactStaging.js';
import { readReadySyncIdentityInventory } from './syncIdentityGlobalRead.js';
import { prepareReadySyncIdentityIndex } from './syncIdentityIndexPreparation.js';
import { compareSyncIdentityKey } from './syncIdentityKeyOrder.js';
import { buildSyncIdentityNodeFactIndex,
  readSyncIdentityNodeFactDataRoot } from './syncIdentityNodeFactIndex.js';
import { assertSyncIdentityPackInnerMatchesDatabase,
  type parseSyncIdentityPackContainerManifest } from './syncIdentityPackManifest.js';
import { prepareSyncIdentityPackReceipt,
  recordSyncIdentityPackReceipt } from './syncIdentityPackReceipts.js';
import { restoreSyncIdentityParentOrderHeads } from './syncIdentityRestoreOrderHeads.js';
import { parseSyncIdentityRestoreSet,
  type SyncIdentityRestoreSet } from './syncIdentityRestoreSet.js';
import { applySyncPackSurfaceInTransaction } from './syncPackNodeApplyExecutor.js';
import { enqueueSyncPackResourceArticles } from './syncPackResourceArticles.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

type Manifest = ReturnType<typeof parseSyncIdentityPackContainerManifest>;

function assertCompleteRestoreSet(set: SyncIdentityRestoreSet, pages: readonly Manifest[]) {
  parseSyncIdentityRestoreSet(set);
  let count = 0;
  let previous: string | null = null;
  let lastObject: { object_type: string; object_id: string } | null = null;
  const digest = createSyncIdentityDigest();
  for (const [index, manifest] of pages.entries()) {
    const page = manifest.identity_page;
    if (page.page_index !== index || page.previous_page_id !== previous ||
        page.restore_id !== set.restore_id || page.restore_set_id !== set.set_id ||
        page.group_id !== set.group_id || page.source_view_id !== set.source_view_id ||
        page.source_peer_id !== set.source_peer_id ||
        page.target_peer_id !== set.target_peer_id || page.objects.length === 0) {
      throw new Error('sync_identity_restore_set_incomplete');
    }
    previous = page.page_id;
    if (page.facts && page.facts.section !== 'head') continue;
    for (const object of page.objects) {
      if (lastObject && compareSyncIdentityKey(lastObject, object) >= 0) {
        throw new Error('sync_identity_restore_set_incomplete');
      }
      digest.add(object);
      lastObject = object;
    }
    count += page.objects.length;
  }
  if (count !== set.object_count) throw new Error('sync_identity_restore_set_incomplete');
  if (digest.finish() !== set.inventory.digest) throw new Error('sync_identity_restore_set_incomplete');
}

async function assertRestoredResult(tx: DbPort, set: SyncIdentityRestoreSet) {
  await prepareReadySyncIdentityIndex(tx, { publishPositions: false });
  const inventory = await readReadySyncIdentityInventory(tx);
  if (inventory.row_count !== set.inventory.row_count || inventory.digest !== set.inventory.digest) {
    throw new Error('sync_identity_restore_result_mismatch');
  }
  await buildSyncIdentityNodeFactIndex(tx);
  if (await readSyncIdentityNodeFactDataRoot(tx) !== set.fact_data_root) {
    throw new Error('sync_identity_restore_fact_data_mismatch');
  }
}

/** One transaction owns the clear, all verified pages, receipts and restore marker. */
export async function applySyncIdentityRestoreWithDbPort(port: DbPort, args: {
  enqueueSearchInvalidations?: boolean;
  hostName: string;
  loadPage: (tx: DbPort, index: number, manifest: Manifest) => Promise<void>;
  onSettingApplied?: (port: DbPort, record: SyncPackSyncObjectRecord) => Promise<void>;
  pages: readonly Manifest[];
  set: SyncIdentityRestoreSet;
  sourceHostName?: string;
}) {
  assertCompleteRestoreSet(args.set, args.pages);
  return port.transaction(async (tx) => {
    const set = args.set;
    const latest = await assertRestoreSource(tx, set);
    if (latest.applied) return { applied: false, removedNodeIds: [] as string[] };
    const removedNodeIds = await clearWorkgroupSyncDataForRestore(tx, set.restore_id);
    for (const [index, manifest] of args.pages.entries()) {
      await args.loadPage(tx, index, manifest);
      await assertSyncIdentityPackInnerMatchesDatabase(tx, manifest);
      const receipt = { page: manifest.identity_page,
        packId: manifest.pack_id,
        databaseSha256: manifest.database_uncompressed_sha256 };
      if ((await prepareSyncIdentityPackReceipt(tx, receipt)).duplicate) {
        throw new Error('sync_identity_restore_receipt_duplicate');
      }
      if (manifest.identity_page.facts && manifest.identity_page.facts.section !== 'head' && manifest.fact_tail) {
        await stageSyncIdentityFactPage(tx, manifest.identity_page, manifest.fact_tail, manifest.fact_chunk);
        await recordSyncIdentityPackReceipt(tx, receipt);
        continue;
      }
      await assembleSyncIdentityStagedFacts(tx, manifest.identity_page);
      const dependencies = await assembleSyncIdentityDependencyFacts(tx, manifest.identity_page, manifest.dependencies);
      await applySyncPackSurfaceInTransaction(tx, {
        currentCursor: 0, hostName: args.hostName, incomingAlias: 'inc',
        sourcePeerId: set.source_peer_id,
        ...(args.sourceHostName ? { sourceHostName: args.sourceHostName } : {}),
        ...(args.enqueueSearchInvalidations === false ?
          { enqueueSearchInvalidations: false } : {}),
        ...(args.onSettingApplied ? { onSettingApplied: args.onSettingApplied } : {})
      }, true, null);
      await restoreSyncIdentityParentOrderHeads(tx);
      await enqueueSyncPackResourceArticles(tx, { groupId: set.group_id,
        incomingAlias: 'inc', peerId: set.source_peer_id });
      await clearSyncIdentityStagedFacts(tx, manifest.identity_page);
      await clearSyncIdentityDependencyFacts(tx, dependencies);
      await recordSyncIdentityPackReceipt(tx, receipt);
    }
    await assertRestoredResult(tx, set);
    await markSyncGroupRestoreApplied(tx, latest.event);
    return { applied: true, removedNodeIds };
  });
}

async function assertRestoreSource(tx: DbPort, set: SyncIdentityRestoreSet) {
    const [local] = await tx.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`);
    const [member] = await tx.query<{ state: string }>(`SELECT state FROM sync_group_devices
      WHERE group_id = ? AND device_identity_key = ?`,
    [set.group_id, set.source_peer_id]);
    const latest = await loadLatestSyncGroupRestoreEvent(tx, set.group_id);
    if (local?.group_id !== set.group_id ||
        local.local_device_identity_key !== set.target_peer_id ||
        member?.state !== 'active' || !latest ||
        latest.event.restore_id !== set.restore_id ||
        latest.event.source_device_identity_key !== set.source_peer_id) {
      throw new Error('sync_identity_restore_source_mismatch');
    }
    return latest;
}
