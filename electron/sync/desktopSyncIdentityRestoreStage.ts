import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { assertSyncIdentityPackInnerMatchesDatabase } from
  '../../lib/core/sync/syncIdentityPackManifest.js';
import type { SyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

import { readDesktopSyncIdentityCandidatePage } from './desktopSyncIdentityCandidatePages.js';
import { exchangeDesktopSyncIdentityFactPages } from './desktopSyncIdentityFactExchange.js';
import { downloadDesktopSyncIdentityArchive,
  type DesktopIdentityPackPeer } from './desktopSyncIdentityPack.js';
import { probeDesktopSyncIdentityRestoreSet } from './desktopSyncIdentityRestoreProbe.js';
import { extractSyncIdentityPackDatabaseFromFile } from './syncPackContainerReader.js';

type RestoreProbe = Awaited<ReturnType<typeof probeDesktopSyncIdentityRestoreSet>>;

async function verifyRestoreArchive(args: {
  archivePath: string; databasePath: string; pageId: string;
  peer: DesktopIdentityPackPeer; port: ReturnType<typeof createBetterSqliteDbPort>;
  restoreId: string; setId: string;
}) {
  const manifest = await extractSyncIdentityPackDatabaseFromFile({
    archivePath: args.archivePath, outputPath: args.databasePath,
    expectedPeerId: args.peer.local_device_id,
    expectedSourcePeerId: args.peer.peer_device_id,
    maxDatabaseBytes: DEFAULT_SYNC_PACK_PAGE_BUDGET.databaseBytes
  });
  if (manifest.identity_page.page_id !== args.pageId ||
      manifest.identity_page.restore_id !== args.restoreId ||
      manifest.identity_page.restore_set_id !== args.setId) {
    throw new Error('sync_identity_restore_page_mismatch');
  }
  await args.port.run(`ATTACH DATABASE '${args.databasePath.replaceAll("'", "''")}' AS inc`);
  try { await assertSyncIdentityPackInnerMatchesDatabase(args.port, manifest); }
  finally { await args.port.run('DETACH DATABASE inc'); }
  return manifest;
}

/** Collect and verify every pack before any live-library restore transaction. */
export async function stageDesktopSyncIdentityRestore(args: {
  peer: DesktopIdentityPackPeer;
  probe: RestoreProbe;
  limit?: number;
}) {
  const { peer, probe } = args;
  const set = probe.set;
  assertRestorePeer(peer, probe);
  const root = await fs.mkdtemp(path.join(path.dirname(probe.candidatePath), 'packs-'));
  const database = new Database(':memory:');
  const port = createBetterSqliteDbPort(database, { name: 'identity-restore-stage' });
  const pages: Array<{ archivePath: string; databasePath: string; pageId: string;
    manifest: Awaited<ReturnType<typeof extractSyncIdentityPackDatabaseFromFile>> }> = [];
  let after: { object_type: string; object_id: string } | null = null;
  let previousPageId: string | null = null;
  let count = 0;
  let limit = args.limit ?? 128;
  const collect = (page: SyncIdentityPackPage) => collectRestorePage(
    { root, peer, port, set, pages }, page);
  try {
    for (;;) {
      const next = readDesktopSyncIdentityCandidatePage({
        candidatePath: probe.candidatePath, groupId: set.group_id,
        sourcePeerId: set.source_peer_id, targetPeerId: set.target_peer_id,
        sourceViewId: set.source_view_id, pageIndex: pages.length, previousPageId,
        restoreId: set.restore_id, restoreSetId: set.set_id, after,
        direction: 'source', limit
      });
      if (next.page.objects.length === 0) break;
      let completedPage = next.page;
      try {
        await collect(next.page);
      } catch (error) {
        if (limit > 1 && error instanceof Error &&
            error.message.includes('sync_identity_pack_page_over_budget')) {
          limit = Math.max(1, Math.floor(limit / 2));
          continue;
        }
        if (!(error instanceof Error) || !error.message.includes('sync_identity_pack_page_over_budget') ||
            next.page.objects.length !== 1 || next.page.objects[0]?.object_type !== 'node') throw error;
        completedPage = (await exchangeDesktopSyncIdentityFactPages({ peer, page: next.page,
          transfer: collect }, 'source')).page;
      }
      count += next.page.objects.length;
      after = { object_type: next.page.objects.at(-1)!.object_type,
        object_id: next.page.objects.at(-1)!.object_id };
      previousPageId = completedPage.page_id;
      if (!next.nextAfter) break;
    }
    if (count !== set.object_count) throw new Error('sync_identity_restore_set_incomplete');
    return { pages, set, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  } finally { database.close(); }
}

function assertRestorePeer(peer: DesktopIdentityPackPeer, probe: RestoreProbe) {
  const set = probe.set;
  if (set.group_id !== peer.group_id || set.source_peer_id !== peer.peer_device_id ||
      set.target_peer_id !== peer.local_device_id || probe.count !== set.object_count) {
    throw new Error('sync_identity_restore_source_mismatch');
  }
}

async function collectRestorePage(args: {
  root: string; peer: DesktopIdentityPackPeer;
  port: ReturnType<typeof createBetterSqliteDbPort>; set: RestoreProbe['set'];
  pages: Array<{ archivePath: string; databasePath: string; pageId: string;
    manifest: Awaited<ReturnType<typeof extractSyncIdentityPackDatabaseFromFile>> }>;
}, page: SyncIdentityPackPage) {
  const archivePath = await downloadDesktopSyncIdentityArchive({ outputRoot: args.root, page, peer: args.peer });
  const databasePath = path.join(args.root, `${args.pages.length}.db`);
  const manifest = await verifyRestoreArchive({ archivePath, databasePath, pageId: page.page_id,
    peer: args.peer, port: args.port, restoreId: args.set.restore_id, setId: args.set.set_id });
  args.pages.push({ archivePath, databasePath, pageId: page.page_id, manifest });
  return { applied: true, factTail: manifest.fact_tail };
}
