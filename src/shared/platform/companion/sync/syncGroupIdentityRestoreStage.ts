import { stageSyncIdentityRestorePage } from '../../../../../lib/core/sync/syncIdentityRestorePageStorage.js';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { downloadCompanionSyncIdentityPage } from './pack-apply/companionSyncIdentityDownload';
import { readCompanionIdentityCandidatePage } from './syncGroupIdentityCandidateStore';
import { exchangeCompanionSyncIdentityFactPages } from './syncGroupIdentityFactExchange';
import { probeCompanionSyncIdentityRestoreSet } from './syncGroupIdentityRestoreProbe';
import { withCompanionSyncIdentitySnapshot } from './syncGroupIdentitySourceRead';

type RestoreProbe = Awaited<ReturnType<typeof probeCompanionSyncIdentityRestoreSet>>;
type Downloaded = Awaited<ReturnType<typeof downloadCompanionSyncIdentityPage>>;

async function stageDownloadedPage(snapshotPath: string, downloaded: Downloaded) {
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((port) =>
    withCompanionSyncIdentitySnapshot(port, snapshotPath, async (db) => {
      await db.run(`ATTACH DATABASE '${downloaded.packPath.replaceAll("'", "''")}' AS inc`);
      try {
        await db.transaction((tx) => stageSyncIdentityRestorePage(tx,
          downloaded.page.page_index, downloaded.manifest));
      } finally { await db.run('DETACH DATABASE inc'); }
    })));
}

/** Hold every authenticated page until the complete fixed collection is present. */
export async function stageCompanionSyncIdentityRestore(args: {
  endpointUrl: string;
  probe: RestoreProbe;
  limit?: number;
}) {
  const { set } = args.probe;
  const pages: Array<Pick<Downloaded, 'page' | 'manifest'>> = [];
  let replay: Downloaded | undefined;
  let after: { object_type: string; object_id: string } | null = null;
  let previousPageId: string | null = null;
  let count = 0;
  let limit = args.limit ?? 128;
  const collect = async (page: Downloaded['page']) => {
    const downloaded = await downloadCompanionSyncIdentityPage({ endpointUrl: args.endpointUrl, page });
    try { await stageDownloadedPage(args.probe.snapshotPath, downloaded); }
    catch (error) { await downloaded.cleanup(); throw error; }
    if (pages.length === 0) replay = downloaded;
    else await downloaded.cleanup();
    pages.push({ page: downloaded.page, manifest: downloaded.manifest });
    return { applied: true, factTail: downloaded.manifest.fact_tail };
  };
  try {
    for (;;) {
      const next = await readCompanionIdentityCandidatePage({
        snapshotPath: args.probe.snapshotPath, direction: 'source',
        groupId: set.group_id, sourcePeerId: set.source_peer_id,
        targetPeerId: set.target_peer_id, sourceViewId: set.source_view_id,
        restoreId: set.restore_id, restoreSetId: set.set_id,
        pageIndex: pages.length, previousPageId,
        after, limit
      });
      if (!next.page.objects.length) break;
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
        completedPage = (await exchangeCompanionSyncIdentityFactPages({ endpointUrl: args.endpointUrl,
          snapshotPath: args.probe.snapshotPath, page: next.page, transfer: collect }, 'source')).page;
      }
      count += next.page.objects.length;
      after = { object_type: next.page.objects.at(-1)!.object_type,
        object_id: next.page.objects.at(-1)!.object_id };
      previousPageId = completedPage.page_id;
      if (!next.nextAfter) break;
    }
    if (count !== set.object_count) throw new Error('sync_identity_restore_set_incomplete');
    return { pages, replayPackPath: replay?.packPath, set,
      cleanup: async () => { await replay?.cleanup(); } };
  } catch (error) {
    await replay?.cleanup();
    throw error;
  }
}
