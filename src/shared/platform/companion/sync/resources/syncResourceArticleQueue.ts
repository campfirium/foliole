import {
  clearSyncPackResourceArticles,
  loadSyncPackResourceArticleBatch
} from '../../../../../../lib/core/sync/syncPackResourceArticles';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionSyncGroup } from '../syncGroupStore';

async function groupId() {
  const group = await loadCompanionSyncGroup();
  if (!group?.group_id) throw new Error('sync_group_not_joined');
  return group.group_id;
}

export async function loadCompanionResourceArticleBatch(peerId: string, afterId = '') {
  const group = await groupId();
  return getIosCompanionDatabaseOwner().read((db) =>
    loadSyncPackResourceArticleBatch(db, group, peerId, afterId));
}

export async function clearCompanionResourceArticles(peerId: string, ids: readonly string[]) {
  const group = await groupId();
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) =>
    clearSyncPackResourceArticles(db, group, peerId, ids)));
}
