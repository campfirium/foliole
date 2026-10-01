import {
  clearSyncPackResourceArticles,
  loadSyncPackResourceArticleBatch
} from '../../lib/core/sync/syncPackResourceArticles.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { downloadDesktopSyncGroupResources } from './desktopSyncGroupResources.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export async function drainDesktopSyncGroupResourceArticles(peer: DesktopSyncGroupPeer) {
  let afterId = '';
  let incomplete = false;
  let priorMissing = Number.POSITIVE_INFINITY;
  for (;;) {
    const result = await downloadDesktopSyncGroupResources(peer, [], true);
    if (hasDiskFull(result)) throw new Error('sync_group_resources_disk_full');
    if (hasIssues(result) || result.remainingContentBlobCount >= priorMissing) {
      incomplete = true;
      break;
    }
    if (!result.remainingContentBlobCount) break;
    priorMissing = result.remainingContentBlobCount;
  }
  for (;;) {
    const ids = await runWithDatabaseConnectionOwner(() => loadSyncPackResourceArticleBatch(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite),
      peer.group_id, peer.peer_device_id, afterId
    ));
    if (ids.length === 0) {
      if (incomplete) throw new Error('sync_group_resources_incomplete');
      return;
    }
    const result = await downloadDesktopSyncGroupResources(peer, ids, false);
    if (hasDiskFull(result)) throw new Error('sync_group_resources_disk_full');
    if (hasIssues(result)) {
      incomplete = true;
      afterId = ids[ids.length - 1]!;
      continue;
    }
    await runWithDatabaseConnectionOwner(() => clearSyncPackResourceArticles(
      createBetterSqliteDbPort(openDatabaseConnection().sqlite),
      peer.group_id, peer.peer_device_id, ids
    ));
    afterId = ids[ids.length - 1]!;
  }
}

function hasIssues(result: Awaited<ReturnType<typeof downloadDesktopSyncGroupResources>>) {
  return result.unreadableArticleIds.length > 0 || result.failedStorageKeys.length > 0 ||
    result.resourceResults.some((item) => item.unresolved.length > 0);
}

function hasDiskFull(result: Awaited<ReturnType<typeof downloadDesktopSyncGroupResources>>) {
  return result.resourceResults.some((item) => item.issues.some((issue) => issue.error === 'disk_full'));
}
