import { promises as fs } from 'node:fs';

import { verifySyncIdentityFactProof } from '../../lib/core/sync/syncIdentityFactProofSeal.js';
import type { SyncIdentityFactTransfer } from '../../lib/core/sync/syncIdentityFactTransfer.js';
import { readReadySyncIdentityGlobalPage, readReadySyncIdentityInventory } from '../../lib/core/sync/syncIdentityGlobalRead.js';
import { readSyncIdentityNodeFactDataRoot } from '../../lib/core/sync/syncIdentityNodeFactIndex.js';
import { buildSyncIdentityPackPage, type SyncIdentityPackObject } from '../../lib/core/sync/syncIdentityPackPage.js';
import { applySyncIdentityRestoreWithDbPort } from '../../lib/core/sync/syncIdentityRestoreApply.js';
import { buildSyncIdentityRestoreSet } from '../../lib/core/sync/syncIdentityRestoreSet.js';
import { loadDesktopSyncIdentityRestorePage } from '../sync/desktopSyncIdentityRestorePageLoad.js';
import { extractSyncIdentityPackDatabaseFromFile } from '../sync/syncPackContainerReader.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { createFactTransferFixture } from './syncIdentityFactTransfer.testSupport.js';
import { buildSyncIdentityPackFromDriver } from './syncIdentityPackBuilder.js';
import { resolveSyncPackPath } from './syncPackBuilderTestSupport.js';

type Fixture = Awaited<ReturnType<typeof createFactTransferFixture>>;

async function prepareRestoreSet(fixture: Fixture) {
  return buildSyncIdentityRestoreSet({ restore_id: 'large-history-restore', group_id: 'group',
    source_peer_id: fixture.source.identity_key, target_peer_id: fixture.target.identity_key,
    source_view_id: fixture.view.sourceViewId, source_epoch: fixture.view.sourceEpoch,
    inventory: await readReadySyncIdentityInventory(fixture.view.port),
    fact_proof_root: await verifySyncIdentityFactProof(fixture.view.port),
    fact_data_root: await readSyncIdentityNodeFactDataRoot(fixture.view.port) });
}

async function buildRestorePacks(fixture: Fixture, set: Awaited<ReturnType<typeof prepareRestoreSet>>) {
  const packs: Array<{ manifest: Awaited<ReturnType<typeof extractSyncIdentityPackDatabaseFromFile>>;
    databasePath: string }> = [];
  let previous: string | null = null;
  async function append(object: SyncIdentityPackObject, facts?: SyncIdentityFactTransfer) {
    const page = buildSyncIdentityPackPage({ group_id: set.group_id, source_peer_id: set.source_peer_id,
      target_peer_id: set.target_peer_id, source_view_id: set.source_view_id,
      page_index: packs.length, previous_page_id: previous,
      restore_id: set.restore_id, restore_set_id: set.set_id, objects: [object], ...(facts ? { facts } : {}) });
    const archivePath = resolveSyncPackPath(`large-restore-${packs.length}.zip`);
    const databasePath = resolveSyncPackPath(`large-restore-${packs.length}.db`);
    await buildSyncIdentityPackFromDriver({ page, outputPath: archivePath }, fixture.view.driver);
    const manifest = await extractSyncIdentityPackDatabaseFromFile({ archivePath,
      expectedPeerId: set.target_peer_id, expectedSourcePeerId: set.source_peer_id, outputPath: databasePath });
    packs.push({ manifest, databasePath });
    previous = page.page_id;
    return manifest.fact_tail?.nextAfter ?? null;
  }
  const entries = (await readReadySyncIdentityGlobalPage(fixture.view.port, null)).entries;
  for (const object of entries) {
    if (object.object_type !== 'node') { await append(object); continue; }
    const fact = fixture.view.driver.queryOne<{ digest: string }>(
      'SELECT digest FROM sync_identity_node_facts WHERE node_id = ?', [object.object_id]);
    if (!fact) throw new Error('fixture_node_fact_missing');
    for (const section of ['versions', 'parents', 'reviews'] as const) {
      let after: string | null = null;
      do { after = await append(object, { section, after, limit: 64, digest: fact.digest }); }
      while (after !== null);
    }
    await append(object, { section: 'head', after: null, limit: 64, digest: fact.digest });
  }
  return packs;
}

export async function createLargeFactRestoreFixture() {
  const fixture = await createFactTransferFixture(4097);
  try {
    const set = await prepareRestoreSet(fixture);
    const packs = await buildRestorePacks(fixture, set);
    fixture.receiver.prepare(`INSERT INTO sync_group_restore_events
      (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
      VALUES (?, 'group', '2026-10-04T00:00:00.000Z', ?, NULL, 'now')`)
      .run(set.restore_id, set.source_peer_id);
    return { ...fixture, set, packs, async apply(corruptFinalPage = false) {
      const replayPath = resolveSyncPackPath('large-restore-replay.db');
      const first = packs[0];
      if (!first) throw new Error('fixture_restore_pack_missing');
      await fs.copyFile(first.databasePath, replayPath);
      const port = createBetterSqliteDbPort(fixture.receiver);
      await port.run('ATTACH DATABASE ? AS inc', [replayPath]);
      try {
        return await applySyncIdentityRestoreWithDbPort(port, { set, hostName: 'Target',
          enqueueSearchInvalidations: false,
          pages: packs.map((pack, index) => corruptFinalPage && index === packs.length - 1 ?
            { ...pack.manifest, pack_id: '0'.repeat(64) } : pack.manifest),
          loadPage: (tx, index) => loadDesktopSyncIdentityRestorePage(tx, packs[index]!.databasePath) });
      } finally { await port.run('DETACH DATABASE inc'); }
    } };
  } catch (error) { fixture.close(); throw error; }
}
